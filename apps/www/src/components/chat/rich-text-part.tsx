import { memo } from "react";
import { UIRichTextPart } from "@terragon/shared";
import {
  mentionPillStyle,
  linkClasses,
} from "@/components/shared/mention-pill-styles";

interface RichTextPartProps {
  richTextPart: UIRichTextPart;
}

export const RichTextPart = memo(function RichTextPart({
  richTextPart,
}: RichTextPartProps) {
  return (
    <div className="whitespace-pre-wrap">
      {richTextPart.nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return <span key={index}>{node.text}</span>;
          case "mention":
            const isFolder = node.text.endsWith("/");
            return (
              <span
                key={index}
                className={mentionPillStyle}
                data-is-folder={isFolder ? "true" : "false"}
              >
                {node.text}
              </span>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.text}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClasses}
              >
                {node.text}
              </a>
            );
          default:
            return <span key={index}>{node.text}</span>;
        }
      })}
    </div>
  );
});
