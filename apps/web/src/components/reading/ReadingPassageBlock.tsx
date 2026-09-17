import { formatPassageLines } from "@/lib/formatPassageText";
import { SpeakableTextBlock } from "./SpeakableTextBlock";

interface ReadingPassageBlockProps {
  text: string;
}

// Renders a Part6/Part7 result-mode passage/document with the existing
// `.reading-passage-block > p.reading-passage-text` markup, wrapped for
// select-to-speak (English source text) so a selection spanning multiple
// paragraphs of the same passage still resolves to one button.
export function ReadingPassageBlock({ text }: ReadingPassageBlockProps) {
  return (
    <SpeakableTextBlock className="reading-passage-block">
      {formatPassageLines(text).map((line, li) => (
        <p key={li} className="reading-passage-text">
          {line}
        </p>
      ))}
    </SpeakableTextBlock>
  );
}
