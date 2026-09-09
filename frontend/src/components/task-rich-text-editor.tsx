"use client";

import { useEffect, useRef } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { markInputRule } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
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
  ListIcon,
  ListOrderedIcon,
  IndentIncreaseIcon,
  IndentDecreaseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { legacyTextToDocument } from "@/lib/rich-text-document";
import { hasTaskBlanks } from "@/lib/task-blank";
import {
  TaskBlank,
  TaskParagraphIndent,
  changeTaskIndent,
} from "@/lib/task-blank-extension";

const extensions = [
  TaskBlank,
  TaskParagraphIndent,
  StarterKit.configure({
    heading: false,
    blockquote: false,
    bulletList: { keepMarks: true },
    orderedList: { keepMarks: true },
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
  {
    name: "bulletList",
    label: "Lista con viñetas",
    shortcut: "Ctrl+Shift+8",
    icon: ListIcon,
  },
  {
    name: "orderedList",
    label: "Lista numerada",
    shortcut: "Ctrl+Shift+7",
    icon: ListOrderedIcon,
  },
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
  allowBlanks = false,
  onSelectBlank,
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
  allowBlanks?: boolean;
  onSelectBlank?: (blankId: string) => void;
}) {
  const previousValue = useRef({ content, richText });
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    enableInputRules: [
      "bold",
      "italic",
      "underline",
      "strike",
      "bulletList",
      "orderedList",
    ],
    enablePasteRules: false,
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
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e")
          return true;
        // List commands own Enter, Backspace and indentation inside a list.
        for (let depth = view.state.selection.$from.depth; depth > 0; depth--) {
          if (view.state.selection.$from.node(depth).type.name === "listItem")
            return false;
        }
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          onEnter &&
          !allowBlanks
        ) {
          onEnter();
          return true;
        }
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !view.state.doc.textContent.trim() &&
          !hasTaskBlanks(view.state.doc.toJSON())
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
    onSelectionUpdate({ editor: current }) {
      const selection = current.state.selection;
      if (
        selection instanceof NodeSelection &&
        selection.node.type.name === "taskBlank"
      ) {
        onSelectBlank?.(selection.node.attrs.blankId);
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
    if (
      previousValue.current.content === content &&
      previousValue.current.richText === richText
    )
      return;
    previousValue.current = { content, richText };
    // Parent updates from this editor must not reset selection or undo history.
    const next = richText ?? legacyTextToDocument(content);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, content, richText]);

  return (
    <>
      {allowBlanks && editor && (
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label="Huecos y sangría"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "taskBlank",
                  attrs: { blankId: crypto.randomUUID() },
                })
                .run()
            }
          >
            Insertar hueco
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Reducir sangría"
            title="Reducir sangría"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeTaskIndent(editor, -1)}
          >
            <IndentDecreaseIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Aumentar sangría"
            title="Aumentar sangría"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeTaskIndent(editor, 1)}
          >
            <IndentIncreaseIcon />
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
      {editor && (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          getReferencedVirtualElement={() => {
            const selection = editor.view.dom.ownerDocument.getSelection();
            if (
              !selection?.rangeCount ||
              !editor.view.dom.contains(selection.anchorNode)
            )
              return null;
            const range = selection.getRangeAt(0).cloneRange();
            return {
              getBoundingClientRect: () => range.getBoundingClientRect(),
              getClientRects: () => range.getClientRects(),
            };
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
                      onClick={() => {
                        const chain = editor.chain();
                        if (name === "bulletList")
                          chain.toggleBulletList().run();
                        else if (name === "orderedList")
                          chain.toggleOrderedList().run();
                        else chain.toggleMark(name).run();
                        editor.view.focus();
                      }}
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
