"use client";

import { useEffect } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { markInputRule } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  CodeIcon,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { legacyTextToDocument } from "@/lib/rich-text-document";

const extensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    trailingNode: false,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
  }),
  Bold.extend({
    addInputRules() {
      return [
        markInputRule({ find: /(?:^|\s)(\*\*([^*]+)\*\*)$/, type: this.type }),
        markInputRule({ find: /(?:^|\s)(\*([^*]+)\*)$/, type: this.type }),
      ];
    },
    addPasteRules() {
      return [];
    },
  }),
  Italic.extend({
    addInputRules() {
      return [markInputRule({ find: /(?:^|\s)(_([^_]+)_)$/, type: this.type })];
    },
    addPasteRules() {
      return [];
    },
  }),
  Underline.extend({
    addInputRules() {
      return [
        markInputRule({ find: /(?:^|\s)(__([^_]+)__)$/, type: this.type }),
      ];
    },
  }),
  Strike.extend({
    addKeyboardShortcuts() {
      return { "Mod-Shift-x": () => this.editor.commands.toggleStrike() };
    },
    addInputRules() {
      return [
        markInputRule({
          find: /(?:^|\s)(~{1,2}([^~]+)~{1,2})$/,
          type: this.type,
        }),
      ];
    },
    addPasteRules() {
      return [];
    },
  }),
];

const formats = [
  { name: "bold", label: "Negrita", shortcut: "Ctrl+B", icon: BoldIcon },
  { name: "italic", label: "Cursiva", shortcut: "Ctrl+I", icon: ItalicIcon },
  {
    name: "underline",
    label: "Subrayado",
    shortcut: "Ctrl+U",
    icon: UnderlineIcon,
  },
  {
    name: "strike",
    label: "Tachado",
    shortcut: "Ctrl+Shift+X",
    icon: StrikethroughIcon,
  },
  { name: "code", label: "Código", shortcut: "Ctrl+E", icon: CodeIcon },
];

export function TaskRichTextEditor({
  id,
  content,
  richText,
  placeholder,
  invalid,
  onChange,
  onReady,
  onEnter,
  onRemoveEmpty,
}: {
  id: string;
  content: string;
  richText?: JSONContent;
  placeholder: string;
  invalid: boolean;
  onChange: (content: string, richText: JSONContent) => void;
  onReady: (editor: Editor | null) => void;
  onEnter?: () => void;
  onRemoveEmpty?: () => boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: richText ?? legacyTextToDocument(content),
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": placeholder,
        "aria-multiline": "true",
        "aria-invalid": String(invalid),
        "data-placeholder": placeholder,
        class:
          "task-rich-text min-h-9 w-full px-2 py-1 text-base leading-6 outline-none md:text-sm",
      },
      handleKeyDown(view, event) {
        if (event.isComposing || view.composing) return false;
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          onEnter
        ) {
          onEnter();
          return true;
        }
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !view.state.doc.textContent.trim()
        ) {
          return onRemoveEmpty?.() ?? false;
        }
        return false;
      },
    },
    onUpdate({ editor: current }) {
      onChange(current.getText({ blockSeparator: "\n" }), current.getJSON());
      if (current.isEmpty && current.state.storedMarks?.length) {
        current.commands.unsetAllMarks();
      }
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: formats
        .filter((format) => current?.isActive(format.name))
        .map((format) => format.name),
    }),
  });

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    // Parent updates from this editor must not reset selection or undo history.
    const next = richText ?? legacyTextToDocument(content);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, content, richText]);

  return (
    <>
      <EditorContent editor={editor} />
      {editor && (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          getReferencedVirtualElement={() => {
            const selection = editor.view.dom.ownerDocument.getSelection();
            if (!selection?.rangeCount || !editor.view.dom.contains(selection.anchorNode)) return null;
            const range = selection.getRangeAt(0).cloneRange();
            return { getBoundingClientRect: () => range.getBoundingClientRect(), getClientRects: () => range.getClientRects() };
          }}
          options={{
            placement: "top",
            offset: 8,
            flip: true,
            shift: { padding: 8 },
          }}
        >
          <TooltipProvider delayDuration={400}>
            <ToggleGroup
              type="multiple"
              size="sm"
              aria-label="Formato del texto"
              className="rounded-full border bg-popover p-1 shadow-lg"
              value={state?.active ?? []}
            >
              {formats.map(({ name, label, shortcut, icon: Icon }) => (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value={name}
                      aria-label={label}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        editor.chain().focus().toggleMark(name).run()
                      }
                    >
                      <Icon />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>
                    {label} · {shortcut}
                  </TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          </TooltipProvider>
        </BubbleMenu>
      )}
    </>
  );
}
