/**
 *
 * This file is heavily based on MonoGame's implementation of their LzxDecoder attributed to Ali Scissons
 * which is derived from libmspack by Stuart Cole.
 *
 * (C) 2003-2004 Stuart Caie.
 * (C) 2011 Ali Scissons.
 * (C) 2017 James Stine.
 *
 * The LZX method was created by Johnathan Forbes and Tomi Poutanen, adapted by Microsoft Corporation.
 *
 */

/**
 * GNU LESSER GENERAL PUBLIC LICENSE version 2.1
 * LzxDecoder is free software; you can redistribute it and/or modify it under
 * the terms of the GNU Lesser General Public License (LGPL) version 2.1
 */

/**
 * MICROSOFT PUBLIC LICENSE
 * This source code a derivative on LzxDecoder and is subject to the terms of the Microsoft Public License (Ms-PL).
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * is permitted provided that redistributions of the source code retain the above
 * copyright notices and this file header.
 *
 * Additional copyright notices should be appended to the list above.
 *
 * For details, see <http://www.opensource.org/licenses/ms-pl.html>.
 */

import Log from './Log.js';
import LzxReader from './Buffer/LzxReader.js';
import XnbError from './XnbError.js';

// LZX Constants
const MIN_MATCH = 2; // smallest allowable match length
const MAX_MATCH = 257; // largest allowable match length
const NUM_CHARS = 256; // number of uncompressed character types
const BLOCKTYPE = {
  INVALID: 0,
  VERBATIM: 1,
  ALIGNED: 2,
  UNCOMPRESSED: 3
};
const PRETREE_NUM_ELEMENTS = 20;
const ALIGNED_NUM_ELEMENTS = 8; // aligned offset tree elements
const NUM_PRIMARY_LENGTHS = 7;
const NUM_SECONDARY_LENGTHS = 249; // number of elements in length tree

// LZX Huffman Constants
const PRETREE_MAXSYMBOLS = PRETREE_NUM_ELEMENTS;
const PRETREE_TABLEBITS = 6;
const MAINTREE_MAXSYMBOLS = NUM_CHARS + 50 * 8;
const MAINTREE_TABLEBITS = 12;
const LENGTH_MAXSYMBOLS = NUM_SECONDARY_LENGTHS + 1;
const LENGTH_TABLEBITS = 12;
const ALIGNED_MAXSYMBOLS = ALIGNED_NUM_ELEMENTS;
const ALIGNED_TABLEBITS = 7;
const LENTABLE_SAFETY = 64; // table decoding overruns are allowed

/**
 * LZX Static Data Tables
 *
 * LZX uses 'position slots' to represent match offsets.  For every match,
 * a small 'position slot' number and a small offset from that slot are
 * encoded instead of one large offset.
 *
 * position_base[] is an index to the position slot bases
 *
 * extra_bits[] states how many bits of offset-from-base data is needed.
 */
const positionBase: number[] = [];
const extraBits: number[] = [];

export default class Lzx {
  private readonly _window_size: number;
  private _R0: number;
  private _R1: number;
  private _R2: number;
  private readonly _main_elements: number;
  private _header_read: boolean;
  private _block_remaining: number;
  private _block_type: number;
  private _window_posn: number;
  private _pretree_table: number[];
  private readonly _pretree_len: number[];
  private _aligned_table: number[];
  private readonly _aligned_len: number[];
  private _length_table: number[];
  private readonly _length_len: number[];
  private _maintree_table: number[];
  private readonly _maintree_len: number[];
  private readonly _win: number[];

  // Creates an instance of LZX with a given window frame.
  public constructor(windowBits: number) {
    // Get the window size from window bits.
    this._window_size = 1 << windowBits;

    // LZX supports window sizes of 2^15 (32 KB) to 2^21 (2 MB).
    if (windowBits < 15 || windowBits > 21) {
      throw new XnbError('Window size out of range!');
    }

    // Initialize static tables.
    if (!extraBits.length) {
      for (let i = 0, j = 0; i <= 50; i += 2) {
        extraBits[i] = extraBits[i + 1] = j;
        if (i !== 0 && j < 17) {
          j++;
        }
      }
    }
    if (!positionBase.length) {
      for (let i = 0, j = 0; i <= 50; i++) {
        positionBase[i] = j;
        j += 1 << extraBits[i];
      }
    }

    Log.debug(`Extra Bits:`);
    Log.debug(JSON.stringify(extraBits));
    Log.debug(`Position Base:`);
    Log.debug(JSON.stringify(positionBase));

    /**
     * Calculate required position slots.
     *
     * Window bits:     15 16 17 18 19 20 21.
     * Position slots:  30 32 34 36 38 42 50.
     */
    const posnSlots = windowBits === 21 ? 50 : windowBits === 20 ? 42 : windowBits << 1;

    // Repeated offsets.
    this._R0 = this._R1 = this._R2 = 1;

    // Set the number of main elements.
    this._main_elements = NUM_CHARS + (posnSlots << 3);

    // State of header being read used for when looping over multiple blocks.
    this._header_read = false;

    // Set the block remaining.
    this._block_remaining = 0;

    // Set the default block type.
    this._block_type = BLOCKTYPE.INVALID;

    // Window position.
    this._window_posn = 0;

    // Frequently used tables.
    this._pretree_table = [];
    this._pretree_len = [];
    this._aligned_table = [];
    this._aligned_len = [];
    this._length_table = [];
    this._length_len = [];
    this._maintree_table = [];
    this._maintree_len = [];

    // Initialize main tree for use with delta operations.
    for (let i = 0; i < MAINTREE_MAXSYMBOLS; i++) {
      this._maintree_len[i] = 0;
    }

    // Initialize length tree for use with delta operations.
    for (let i = 0; i < NUM_SECONDARY_LENGTHS; i++) {
      this._length_len[i] = 0;
    }

    // Init the decompression window.
    this._win = [];
  }

  // Sets the shortest match.
  set RRR(X: number) {
    // No match, R2 <- R1, R1 <- R0, R0 <- X.
    if (this._R0 !== X && this._R1 !== X && this._R2 !== X) {
      // Shift all offsets down.
      this._R2 = this._R1;
      this._R1 = this._R0;
      this._R0 = X;
    } // X = R1, Swap R0 <-> R1.
    else if (this._R1 === X) {
      const R1 = this._R1;
      this._R1 = this._R0;
      this._R0 = R1;
    } // X = R2, Swap R0 <-> R2.
    else if (this._R2 === X) {
      const R2 = this._R2;
      this._R2 = this._R0;
      this._R0 = R2;
    }
  }

  // Decompress the buffer with given frame and block size.
  public decompress(buffer: LzxReader, frameSize: number, blockSize: number): number[] {
    // Read header if we haven't already.
    if (!this._header_read) {
      // Read the intel call.
      const intel = buffer.readLZXBits(1);

      Log.debug(`Intel: ${Log.toBinary(intel, 1)} = ${intel}`);

      if (intel !== 0) {
        throw new XnbError(`Intel E8 Call found, invalid for XNB files.`);
      }

      // The header has been read.
      this._header_read = true;
    }

    // Set what's left to go to the frame size.
    let togo = frameSize;

    // Loop over what's left of the frame.
    while (togo > 0) {
      // This is a new block.
      if (this._block_remaining === 0) {
        // Read in the block type.
        this._block_type = buffer.readLZXBits(3);

        Log.debug(`Blocktype: ${Log.toBinary(this._block_type, 3)} = ${this._block_type}`);

        // Read 24-bit value for uncompressed bytes in this block.
        const hi = buffer.readLZXBits(16);
        const lo = buffer.readLZXBits(8);

        // Number of uncompressed bytes for this block left.
        this._block_remaining = (hi << 8) | lo;

        Log.debug(`Block Remaining: ${this._block_remaining}`);

        // Switch over the valid block types.
        switch (this._block_type) {
          case BLOCKTYPE.ALIGNED:
            // Aligned offset tree.
            for (let i = 0; i < 8; i++) {
              this._aligned_len[i] = buffer.readLZXBits(3);
            }

            // Decode table for aligned tree.
            this._aligned_table = this.decodeTable(ALIGNED_MAXSYMBOLS, ALIGNED_TABLEBITS, this._aligned_len);

          // NOTE: Rest of aligned block type is the same as verbatim block type.
          case BLOCKTYPE.VERBATIM:
            // Read the first 256 elements for main tree.
            this.readLengths(buffer, this._maintree_len, 0, 256);

            // Read the rest of the elements for the main tree.
            this.readLengths(buffer, this._maintree_len, 256, this._main_elements);

            // Decode the main tree into a table.
            this._maintree_table = this.decodeTable(MAINTREE_MAXSYMBOLS, MAINTREE_TABLEBITS, this._maintree_len);

            // Read path lengths for the length tree.
            this.readLengths(buffer, this._length_len, 0, NUM_SECONDARY_LENGTHS);

            // Decode the length tree.
            this._length_table = this.decodeTable(LENGTH_MAXSYMBOLS, LENGTH_TABLEBITS, this._length_len);
            break;
          case BLOCKTYPE.UNCOMPRESSED:
            // Align the bit buffer to byte range
            buffer.align();

            // Read the offsets
            this._R0 = buffer.readInt32();
            this._R1 = buffer.readInt32();
            this._R2 = buffer.readInt32();
            break;
          default:
            throw new XnbError(`Invalid blocktype found: ${this._block_type}`);
        }
      }

      // Iterate over the block remaining.
      let thisRun = this._block_remaining;

      // Loop over the bytes left in the buffer to run out our output.
      while ((thisRun = this._block_remaining) > 0 && togo > 0) {
        // If this run is somehow higher than togo then just cap it.
        if (thisRun > togo) {
          thisRun = togo;
        }

        // Reduce togo and block remaining by this iteration.
        togo -= thisRun;
        this._block_remaining -= thisRun;

        // Apply 2^x-1 mask.
        this._window_posn &= this._window_size - 1;

        // Run cannot exceed frame size.
        if (this._window_posn + thisRun > this._window_size) {
          throw new XnbError('Cannot run outside of window frame.');
        }

        switch (this._block_type) {
          case BLOCKTYPE.ALIGNED:
            while (thisRun > 0) {
              // Get the element of this run.
              let mainElement = this.readHuffSymbol(
                buffer,
                this._maintree_table,
                this._maintree_len,
                MAINTREE_MAXSYMBOLS,
                MAINTREE_TABLEBITS
              );

              // Main element is an unmatched character.
              if (mainElement < NUM_CHARS) {
                this._win[this._window_posn++] = mainElement;
                thisRun--;
                continue;
              }

              mainElement -= NUM_CHARS;

              let lengthFooter;

              let matchLength = mainElement & NUM_PRIMARY_LENGTHS;
              if (matchLength === NUM_PRIMARY_LENGTHS) {
                // Get the length footer.
                lengthFooter = this.readHuffSymbol(
                  buffer,
                  this._length_table,
                  this._length_len,
                  LENGTH_MAXSYMBOLS,
                  LENGTH_TABLEBITS
                );

                // Increase match length by the footer.
                matchLength += lengthFooter;
              }
              matchLength += MIN_MATCH;

              let matchOffset = mainElement >> 3;

              if (matchOffset > 2) {
                // Not repeated offset.
                let extra = extraBits[matchOffset];
                matchOffset = positionBase[matchOffset] - 2;
                if (extra > 3) {
                  // Verbatim and aligned bits.
                  extra -= 3;
                  const verbatimBits = buffer.readLZXBits(extra);
                  matchOffset += verbatimBits << 3;
                  const alignedBits = this.readHuffSymbol(
                    buffer,
                    this._aligned_table,
                    this._aligned_len,
                    ALIGNED_MAXSYMBOLS,
                    ALIGNED_TABLEBITS
                  );
                  matchOffset += alignedBits;
                } else if (extra === 3) {
                  // Aligned bits only.
                  matchOffset += this.readHuffSymbol(
                    buffer,
                    this._aligned_table,
                    this._aligned_len,
                    ALIGNED_MAXSYMBOLS,
                    ALIGNED_TABLEBITS
                  );
                } else if (extra > 0) {
                  // verbatim bits only
                  matchOffset += buffer.readLZXBits(extra);
                } else {
                  matchOffset = 1; // ???
                }

                // Update repeated offset LRU queue.
                this._R2 = this._R1;
                this._R1 = this._R0;
                this._R0 = matchOffset;
              } else if (matchOffset === 0) {
                matchOffset = this._R0;
              } else if (matchOffset === 1) {
                matchOffset = this._R1;
                this._R1 = this._R0;
                this._R0 = matchOffset;
              } else {
                matchOffset = this._R2;
                this._R2 = this._R0;
                this._R0 = matchOffset;
              }

              let rundest = this._window_posn;
              let runsrc;
              thisRun -= matchLength;

              // Copy any wrapped source data.
              if (this._window_posn >= matchOffset) {
                runsrc = rundest - matchOffset; // No wrap.
              } else {
                runsrc = rundest + (this._window_size - matchOffset);
                let copyLength = matchOffset - this._window_posn;
                if (copyLength < matchLength) {
                  matchLength -= copyLength;
                  this._window_posn += copyLength;
                  while (copyLength-- > 0) {
                    this._win[rundest++] = this._win[runsrc++];
                  }
                  runsrc = 0;
                }
              }
              this._window_posn += matchLength;

              // Copy match data - no worrries about destination wraps.
              while (matchLength-- > 0) {
                this._win[rundest++] = this._win[runsrc++];
              }
            }
            break;

          case BLOCKTYPE.VERBATIM:
            while (thisRun > 0) {
              // Get the element of this run.
              let mainElement = this.readHuffSymbol(
                buffer,
                this._maintree_table,
                this._maintree_len,
                MAINTREE_MAXSYMBOLS,
                MAINTREE_TABLEBITS
              );

              // Main element is an unmatched character.
              if (mainElement < NUM_CHARS) {
                this._win[this._window_posn++] = mainElement;
                thisRun--;
                continue;
              }

              // Match: NUM_CHARS + ((slot << 3) | length_header (3 bits))

              mainElement -= NUM_CHARS;

              let lengthFooter;

              let matchLength = mainElement & NUM_PRIMARY_LENGTHS;
              if (matchLength === NUM_PRIMARY_LENGTHS) {
                // Read the length footer.
                lengthFooter = this.readHuffSymbol(
                  buffer,
                  this._length_table,
                  this._length_len,
                  LENGTH_MAXSYMBOLS,
                  LENGTH_TABLEBITS
                );
                matchLength += lengthFooter;
              }
              matchLength += MIN_MATCH;

              let matchOffset = mainElement >> 3;

              if (matchOffset > 2) {
                // Not repeated offset.
                if (matchOffset !== 3) {
                  const extra = extraBits[matchOffset];
                  const verbatimBits = buffer.readLZXBits(extra);
                  matchOffset = positionBase[matchOffset] - 2 + verbatimBits;
                } else {
                  matchOffset = 1;
                }

                // Update repeated offset LRU queue.
                this._R2 = this._R1;
                this._R1 = this._R0;
                this._R0 = matchOffset;
              } else if (matchOffset === 0) {
                matchOffset = this._R0;
              } else if (matchOffset === 1) {
                matchOffset = this._R1;
                this._R1 = this._R0;
                this._R0 = matchOffset;
              } else {
                matchOffset = this._R2;
                this._R2 = this._R0;
                this._R0 = matchOffset;
              }

              let rundest = this._window_posn;
              let runsrc;
              thisRun -= matchLength;

              // Copy any wrapped source data.
              if (this._window_posn >= matchOffset) {
                runsrc = rundest - matchOffset; // No wrap.
              } else {
                runsrc = rundest + (this._window_size - matchOffset);
                let copyLength = matchOffset - this._window_posn;
                if (copyLength < matchLength) {
                  matchLength -= copyLength;
                  this._window_posn += copyLength;
                  while (copyLength-- > 0) {
                    this._win[rundest++] = this._win[runsrc++];
                  }
                  runsrc = 0;
                }
              }
              this._window_posn += matchLength;

              // Copy match data - no worrries about destination wraps.
              while (matchLength-- > 0) {
                this._win[rundest++] = this._win[runsrc++];
              }
            }
            break;

          case BLOCKTYPE.UNCOMPRESSED:
            if (buffer.bytePosition + thisRun > blockSize) {
              throw new XnbError('Overrun!' + blockSize + ' ' + buffer.bytePosition + ' ' + thisRun);
            }
            for (let i = 0; i < thisRun; i++) {
              this._win[this._window_posn + i] = buffer.buffer[buffer.bytePosition + i];
            }
            buffer.bytePosition += thisRun;
            this._window_posn += thisRun;
            break;

          default:
            throw new XnbError('Invalid blocktype specified!');
        }
      }
    }

    // There is still more left.
    if (togo !== 0) {
      throw new XnbError('EOF reached with data left to go.');
    }

    // Ensure the buffer is aligned.
    buffer.align();

    // Get the start window position.
    const startWindowPos = (this._window_posn === 0 ? this._window_size : this._window_posn) - frameSize;

    // Return the window.
    return this._win.slice(startWindowPos, startWindowPos + frameSize);
  }

  /**
   * Reads in code lengths for symbols first to last in the given table.
   * The code lengths are stored in their own special LZX way.
   */
  public readLengths(buffer: LzxReader, table: number[], first: number, last: number): number[] {
    // Read in the 4-bit pre-tree deltas.
    for (let i = 0; i < 20; i++) {
      this._pretree_len[i] = buffer.readLZXBits(4);
    }

    // Create pre-tree table from lengths.
    this._pretree_table = this.decodeTable(PRETREE_MAXSYMBOLS, PRETREE_TABLEBITS, this._pretree_len);

    // Loop through the lengths from first to last.
    for (let i = first; i < last;) {
      // Read in the huffman symbol.
      let symbol = this.readHuffSymbol(
        buffer,
        this._pretree_table,
        this._pretree_len,
        PRETREE_MAXSYMBOLS,
        PRETREE_TABLEBITS
      );

      // Code = 17, run of ([read 4 bits] + 4) zeros.
      if (symbol === 17) {
        // Read in number of zeros as a 4-bit number + 4.
        let zeros = buffer.readLZXBits(4) + 4;

        // Iterate over zeros counter and add them to the table.
        while (zeros-- !== 0) {
          table[i++] = 0;
        }
      } // Code = 18, run of ([read 5 bits] + 20) zeros.
      else if (symbol === 18) {
        // Read in number of zeros as a 5-bit number + 20.
        let zeros = buffer.readLZXBits(5) + 20;

        // Add the number of zeros into the table array.
        while (zeros-- !== 0) {
          table[i++] = 0;
        }
      } // Code = 19 run of ([read 1 bit] + 4) [read huffman symbol].
      else if (symbol === 19) {
        // Read for how many of the same huffman symbol to repeat.
        let same = buffer.readLZXBits(1) + 4;

        // Read another huffman symbol.
        symbol = this.readHuffSymbol(
          buffer,
          this._pretree_table,
          this._pretree_len,
          PRETREE_MAXSYMBOLS,
          PRETREE_TABLEBITS
        );
        symbol = table[i] - symbol;
        if (symbol < 0) symbol += 17;
        while (same-- !== 0) {
          table[i++] = symbol;
        }
      } // Code 0 -> 16, delta current length entry.
      else {
        symbol = table[i] - symbol;
        if (symbol < 0) symbol += 17;
        table[i++] = symbol;
      }
    }

    // Return the table created.
    return table;
  }

  /**
   * Build a decode table from a canonical huffman lengths table.
   * @param symbols Total number of symbols in tree.
   * @param bits Any symbols less than this can be decoded in one lookup of table.
   * @param length Table for lengths of given table to decode.
   * @returns Decoded table, length should be ((1<<nbits) + (nsyms*2)).
   */
  public decodeTable(symbols: number, bits: number, length: number[]): number[] {
    // Decoded table to act on and return.
    const table = [];

    let pos = 0;
    let tableMask = 1 << bits;
    let bitMask = tableMask >> 1;

    // Loop across all bit positions.
    for (let bitNum = 1; bitNum <= bits; bitNum++) {
      // Loop over the symbols we're decoding.

      for (let symbol = 0; symbol < symbols; symbol++) {
        // If the symbol isn't in this iteration of length then just ignore.

        if (length[symbol] === bitNum) {
          let leaf = pos;

          // If the position has gone past the table mask then we're overrun.
          if ((pos += bitMask) > tableMask) {
            Log.debug(length[symbol].toString());
            Log.debug(`pos: ${pos}, bit_mask: ${bitMask}, table_mask: ${tableMask}`);
            Log.debug(`bit_num: ${bitNum}, bits: ${bits}`);
            Log.debug(`symbol: ${symbol}, symbols: ${symbols}`);
            throw new XnbError('Overrun table!');
          }

          // Fill all possible lookups of this symbol with the symbol itself.
          let fill = bitMask;
          while (fill-- > 0) {
            table[leaf++] = symbol;
          }
        }
      }

      // Advance bit mask down the bit positions.
      bitMask >>= 1;
    }

    // Exit with success if table is complete.
    if (pos === tableMask) {
      return table;
    }

    // Mark all remaining table entries as unused.
    for (let symbol = pos; symbol < tableMask; symbol++) {
      table[symbol] = 0xffff;
    }

    // Next_symbol = base of allocation for long codes.
    let nextSymbol = tableMask >> 1 < symbols ? symbols : tableMask >> 1;

    // Allocate space for 16-bit values.
    pos <<= 16;
    tableMask <<= 16;
    bitMask = 1 << 15;

    // Loop again over the bits.
    for (let bitNum = bits + 1; bitNum <= 16; bitNum++) {
      // Loop over the symbol range.
      for (let symbol = 0; symbol < symbols; symbol++) {
        // If the current length iteration doesn't mach our bit then just ignore.
        if (length[symbol] !== bitNum) {
          continue;
        }

        // Get leaf shifted away from 16 bit padding.
        let leaf = pos >> 16;

        // Loop over fill to flood table with.
        for (let fill = 0; fill < bitNum - bits; fill++) {
          // If this path hasn't been taken yet, 'allocate' two entries.
          if (table[leaf] == 0xffff) {
            table[nextSymbol << 1] = 0xffff;
            table[(nextSymbol << 1) + 1] = 0xffff;
            table[leaf] = nextSymbol++;
          }

          // Follow the path and select either left or right for the next bit.
          leaf = table[leaf] << 1;
          if ((pos >> (15 - fill)) & 1) {
            leaf++;
          }
        }
        table[leaf] = symbol;

        // Bits position has overrun the table mask.
        if ((pos += bitMask) > tableMask) {
          throw new XnbError('Overrun table during decoding.');
        }
      }
      bitMask >>= 1;
    }

    // We have reached table mask.
    if (pos === tableMask) {
      return table;
    }

    // Something else went wrong.
    throw new XnbError('Decode table did not reach table mask.');
  }

  // Decodes the next huffman symbol from the bitstream.
  public readHuffSymbol(buffer: LzxReader, table: number[], length: number[], symbols: number, bits: number): number {
    // Peek the specified bits ahead.
    const bit = buffer.peekLZXBits(32) >>> 0; // (>>> 0) allows us to get a 32-bit uint.
    let i = table[buffer.peekLZXBits(bits)];

    // If our table is accessing a symbol beyond our range.
    if (i >= symbols) {
      let j = 1 << (32 - bits);
      do {
        j >>= 1;
        i <<= 1;
        i |= (bit & j) !== 0 ? 1 : 0;
        if (j === 0) {
          return 0;
        }
      } while ((i = table[i]) >= symbols);
    }

    // Seek past this many bits.
    buffer.bitOffset += length[i];

    // Return the symbol.
    return i;
  }
}
