/**
 * Robust SSE Stream Parser (M9.4)
 * Compliant with W3C Server-Sent Events specification.
 * Handles CRLF / LF line endings, arbitrary network chunks, multiline data, comments, IDs, and retry fields.
 */

import { RawSSEMessage } from './types';

export interface SSEParserOptions {
  onComment?: (comment: string) => void;
}

export class SSEParser {
  private buffer: string = '';
  private currentEvent?: string;
  private currentId?: string;
  private currentRetry?: number;
  private dataLines: string[] = [];
  private onComment?: (comment: string) => void;

  constructor(options?: SSEParserOptions) {
    this.onComment = options?.onComment;
  }

  /**
   * Reset parser state completely.
   */
  public reset(): void {
    this.buffer = '';
    this.currentEvent = undefined;
    this.currentId = undefined;
    this.currentRetry = undefined;
    this.dataLines = [];
  }

  /**
   * Feed a raw text chunk into the parser and extract any complete SSE messages.
   */
  public feed(chunk: string): RawSSEMessage[] {
    this.buffer += chunk;
    const messages: RawSSEMessage[] = [];

    let lineStart = 0;

    while (lineStart < this.buffer.length) {
      let lineEnd = -1;
      let nextLineStart = -1;

      // Scan for \r\n, \n, or trailing \r
      for (let i = lineStart; i < this.buffer.length; i++) {
        const char = this.buffer[i];
        if (char === '\n') {
          lineEnd = i;
          nextLineStart = i + 1;
          break;
        } else if (char === '\r') {
          if (i + 1 < this.buffer.length) {
            if (this.buffer[i + 1] === '\n') {
              lineEnd = i;
              nextLineStart = i + 2;
            } else {
              lineEnd = i;
              nextLineStart = i + 1;
            }
            break;
          } else {
            // \r is at the very end of the buffer; wait for next chunk to determine if followed by \n
            return messages;
          }
        }
      }

      if (lineEnd === -1) {
        // No complete line found; remaining buffer stays for next feed
        break;
      }

      const line = this.buffer.slice(lineStart, lineEnd);
      lineStart = nextLineStart;

      // Empty line indicates event dispatch boundary
      if (line === '') {
        const message = this.dispatchCurrentEvent();
        if (message) {
          messages.push(message);
        }
      } else if (line.startsWith(':')) {
        // Comment / heartbeat line
        const commentText = line.slice(1).trimStart();
        if (this.onComment) {
          this.onComment(commentText);
        }
      } else {
        // Field processing
        const colonIdx = line.indexOf(':');
        let field: string;
        let value = '';

        if (colonIdx === -1) {
          field = line;
          value = '';
        } else {
          field = line.slice(0, colonIdx);
          value = line.slice(colonIdx + 1);
          if (value.startsWith(' ')) {
            value = value.slice(1);
          }
        }

        switch (field) {
          case 'data':
            this.dataLines.push(value);
            break;
          case 'event':
            this.currentEvent = value;
            break;
          case 'id':
            this.currentId = value;
            break;
          case 'retry': {
            const parsedRetry = parseInt(value, 10);
            if (!isNaN(parsedRetry) && parsedRetry >= 0) {
              this.currentRetry = parsedRetry;
            }
            break;
          }
          default:
            // Ignore unrecognized fields according to SSE spec
            break;
        }
      }
    }

    // Retain unparsed residual in the buffer
    this.buffer = this.buffer.slice(lineStart);
    return messages;
  }

  private dispatchCurrentEvent(): RawSSEMessage | null {
    // Only dispatch if we have event, data, id, or retry
    if (
      this.dataLines.length === 0 &&
      this.currentEvent === undefined &&
      this.currentId === undefined &&
      this.currentRetry === undefined
    ) {
      return null;
    }

    const message: RawSSEMessage = {
      id: this.currentId,
      event: this.currentEvent,
      data: this.dataLines.join('\n'),
      retry: this.currentRetry,
    };

    // Reset current event accumulator
    this.currentEvent = undefined;
    this.currentId = undefined;
    this.currentRetry = undefined;
    this.dataLines = [];

    return message;
  }
}
