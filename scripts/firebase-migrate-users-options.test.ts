import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  matchesMigrationUser,
  selectedMigrationUsers,
} from "./firebase-migrate-users-options";

describe("Firebase migration user selection", () => {
  test("collects explicit users without duplicates", () => {
    assert.deepEqual(
      selectedMigrationUsers([
        "--mark-verified",
        "--user",
        "admin@example.org",
        "--user",
        "bebras-d1-3",
        "--user",
        "admin@example.org",
      ]),
      ["admin@example.org", "bebras-d1-3"],
    );
  });

  test("rejects a missing selector value", () => {
    assert.throws(
      () => selectedMigrationUsers(["--user", "--check"]),
      /Cada --user requiere un correo o UID\./u,
    );
  });

  test("matches email case-insensitively and UID exactly", () => {
    const user = {
      email: "Admin@Example.org",
      firebaseUid: "bebras-d1-3",
    };
    assert.equal(matchesMigrationUser("admin@example.org", user), true);
    assert.equal(matchesMigrationUser("bebras-d1-3", user), true);
    assert.equal(matchesMigrationUser("BEBRAS-D1-3", user), false);
  });
});
