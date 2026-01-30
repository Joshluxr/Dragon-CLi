import { Node } from "@tiptap/react";
import Suggestion, { SuggestionPluginKey } from "@tiptap/suggestion";

export const slashCommandPluginKey = SuggestionPluginKey;

export const SlashCommand = Node.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        allowSpaces: false,
        startOfLine: true,
      },
    };
  },

  group: "inline",

  inline: true,

  atom: true,

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
