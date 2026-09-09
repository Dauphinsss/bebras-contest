import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import type { EditorView } from "@tiptap/pm/view";
import {
  TaskBlank,
  TaskParagraphIndent,
} from "../frontend/src/lib/task-blank-extension";
import {
  clampTaskIndent,
  getTaskBlankIds,
  hasTaskBlanks,
} from "../frontend/src/lib/task-blank";

// Use the application's exact ProseMirror instances; there are no test-only copies.
const requireFrontend = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { getSchema } = requireFrontend("@tiptap/core");
const { default: StarterKit } = requireFrontend("@tiptap/starter-kit");
const { EditorState, NodeSelection } = requireFrontend("@tiptap/pm/state");
const { Fragment, Slice } = requireFrontend("@tiptap/pm/model");
const { history, undo, redo } = requireFrontend("@tiptap/pm/history");

const schema = getSchema([StarterKit, TaskBlank, TaskParagraphIndent]);
const blank = (id: string) => schema.nodes.taskBlank.create({ blankId: id });
const document = (...ids: string[]) =>
  schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, ids.map(blank)),
  );
function identityPlugin() {
  return TaskBlank.config.addProseMirrorPlugins!.call(TaskBlank as never)[0];
}

test("blank-only documents retain identity and paragraphs retain bounded indent", () => {
  const doc = document("first", "second").toJSON();
  assert.equal(hasTaskBlanks(doc), true);
  assert.deepEqual(getTaskBlankIds(doc), ["first", "second"]);
  assert.equal(hasTaskBlanks(undefined), false);
  assert.equal(clampTaskIndent(-1), 0);
  assert.equal(clampTaskIndent(99), 8);
  assert.equal(clampTaskIndent("2"), 2);
  assert.equal(clampTaskIndent("bad"), 0);
  const paragraph = schema.nodes.paragraph.create(
    { indent: 3 },
    blank("nested"),
  );
  assert.equal(schema.nodeFromJSON(paragraph.toJSON()).attrs.indent, 3);
});

test("duplicate insertion creates a new ID and undo/redo restores those exact identities", () => {
  let state = EditorState.create({
    schema,
    doc: document("original"),
    plugins: [history(), identityPlugin()],
  });
  state = state.applyTransaction(state.tr.insert(2, blank("original"))).state;
  const ids = getTaskBlankIds(state.doc.toJSON());
  assert.equal(ids[0], "original");
  assert.notEqual(ids[1], "original");
  assert.equal(ids.length, 2);
  assert.equal(
    undo(state, (transaction) => {
      state = state.applyTransaction(transaction).state;
    }),
    true,
  );
  assert.deepEqual(getTaskBlankIds(state.doc.toJSON()), ["original"]);
  assert.equal(
    redo(state, (transaction) => {
      state = state.applyTransaction(transaction).state;
    }),
    true,
  );
  assert.deepEqual(getTaskBlankIds(state.doc.toJSON()), ids);
});

test("copy renews IDs across editors, cut moves once, and drag moves preserve identity", () => {
  const plugin = identityPlugin();
  const source = {
    state: EditorState.create({ schema, doc: document("original") }),
  } as EditorView;
  source.state = source.state.apply(
    source.state.tr.setSelection(NodeSelection.create(source.state.doc, 1)),
  );
  const target = {
    state: EditorState.create({ schema, doc: document() }),
    dragging: null,
  } as EditorView;
  const slice = new Slice(Fragment.from(blank("original")), 0, 0);
  const copy = plugin.props.transformPasted!.call(plugin, slice, target, false);
  assert.notEqual(copy.content.firstChild!.attrs.blankId, "original");
  plugin.props.handleDOMEvents!.cut!.call(plugin, source, {} as ClipboardEvent);
  source.state = source.state.apply(source.state.tr.deleteSelection());
  const cut = plugin.props.transformPasted!.call(plugin, slice, target, false);
  assert.equal(cut.content.firstChild!.attrs.blankId, "original");
  const repeatPaste = plugin.props.transformPasted!.call(
    plugin,
    slice,
    target,
    false,
  );
  assert.notEqual(repeatPaste.content.firstChild!.attrs.blankId, "original");
  const dragging = { ...target, dragging: { move: true, slice } } as EditorView;
  assert.equal(
    plugin.props.transformPasted!.call(plugin, slice, dragging, false),
    slice,
  );
});
