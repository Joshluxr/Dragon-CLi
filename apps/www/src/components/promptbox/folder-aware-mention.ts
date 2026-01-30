import Mention, { MentionPluginKey } from "@tiptap/extension-mention";

export const folderAwareMentionPluginKey = MentionPluginKey;

export const FolderAwareMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      isFolder: {
        default: false,
        rendered: true,
        parseHTML: (element) => {
          const label = element.getAttribute("data-mention-label") || "";
          return label.endsWith("/");
        },
        renderHTML: (attributes) => {
          const isFolder = attributes.label?.endsWith("/") || false;
          return {
            "data-is-folder": isFolder ? "true" : "false",
          };
        },
      },
    };
  },
});
