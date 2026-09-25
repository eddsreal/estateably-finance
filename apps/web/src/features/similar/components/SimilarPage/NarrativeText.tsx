import Markdown from 'react-markdown';

const ALLOWED = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'img'];

export function NarrativeText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-8 text-15 text-text-1">
      <Markdown
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          img: ({ alt }) => alt ?? '',
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="flex list-disc flex-col gap-4 pl-20">{children}</ul>,
          ol: ({ children }) => (
            <ol className="flex list-decimal flex-col gap-4 pl-20">{children}</ol>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
