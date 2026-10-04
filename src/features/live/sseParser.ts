export interface SseMessage {
  event: string;
  data: string;
  retry?: number;
}

// Streaming line parser: CR, LF, CRLF, multiline data, comments, and chunk boundaries.
export function createSseParser(receive: (message: SseMessage) => void) {
  let line = '';
  let afterCr = false;
  let event = '';
  let data: string[] = [];
  let retry: number | undefined;
  let size = 0;
  function processLine() {
    if (!line) {
      if (data.length || retry !== undefined)
        receive({ event: event || 'message', data: data.join('\n'), retry });
      event = '';
      data = [];
      retry = undefined;
      size = 0;
    } else if (!line.startsWith(':')) {
      const separator = line.indexOf(':');
      const field = separator < 0 ? line : line.slice(0, separator);
      let value = separator < 0 ? '' : line.slice(separator + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      if (field === 'data') data.push(value);
      if (
        field === 'retry' &&
        /^\d+$/.test(value) &&
        Number.isSafeInteger(Number(value))
      )
        retry = Number(value);
    }
    line = '';
  }
  return (chunk: string) => {
    for (const character of chunk) {
      if (afterCr && character === '\n') {
        afterCr = false;
        continue;
      }
      afterCr = false;
      if (++size > 1_048_576) throw new Error('Stream message too large');
      if (character === '\r' || character === '\n') {
        processLine();
        afterCr = character === '\r';
      } else line += character;
    }
  };
}
