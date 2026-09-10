import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { getTaskBlankIds } from "./task-blank";

export const blankGuardKey = new PluginKey("authoringBlankGuard");

/** Reject first, then replay the original transaction on confirmation. No shadow history. */
export function blankGuard(
  request: (ids: string[], transaction: Transaction) => boolean,
) {
  return new Plugin({
    key: blankGuardKey,
    filterTransaction(transaction, state) {
      if (
        !transaction.docChanged ||
        transaction.getMeta(blankGuardKey) ||
        isHistoryTransaction(transaction)
      )
        return true;
      const next = new Set(getTaskBlankIds(transaction.doc.toJSON()));
      const removed = getTaskBlankIds(state.doc.toJSON()).filter(
        (id) => !next.has(id),
      );
      return !removed.length || !request(removed, transaction);
    },
  });
}
