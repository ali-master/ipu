export function JsonCode({ value }: { value: string }) {
  const lines = value.split("\n");
  return (
    <pre tabIndex={0} aria-label="JSON response">
      <code>
        {lines.map((line, index) => (
          <span className="json-line" key={index}>
            <span
              className="json-line-number"
              aria-hidden="true"
              data-line={index + 1}
            />
            {Array.from(
              line.matchAll(
                /("(?:\\.|[^"\\])*"\s*:?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([^"\d\w-]+)/g,
              ),
              (match) => {
                const token = match[0];
                const kind = match[1]
                  ? token.endsWith(":")
                    ? "key"
                    : "string"
                  : match[2]
                    ? "number"
                    : match[3]
                      ? token === "null"
                        ? "null"
                        : "boolean"
                      : "punctuation";
                return (
                  <span className={`json-${kind}`} key={match.index}>
                    {token}
                  </span>
                );
              },
            )}
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </code>
    </pre>
  );
}
