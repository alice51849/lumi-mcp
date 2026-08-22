import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  recordsDigest,
  validateSnapshotCatalog,
} from "../server/catalog-contract.mjs";

const catalog = JSON.parse(
  await readFile(
    new URL("../server/catalog.json", import.meta.url),
    "utf8",
  ),
);

function changed(update) {
  const payload = structuredClone(catalog);
  update(payload);
  payload.content_digest = recordsDigest(payload.records);
  return payload;
}

test("catalog contract fails closed on incomplete or unsafe records", () => {
  const cases = [
    changed((payload) => {
      payload.records.pop();
      payload.record_count -= 1;
    }),
    changed((payload) => {
      payload.records[0].one_time_option = false;
    }),
    changed((payload) => {
      const url = new URL(payload.records[0].app_store_url);
      url.searchParams.delete("pt");
      payload.records[0].app_store_url = url.toString();
    }),
    changed((payload) => {
      payload.records[0].canonical_guide_url =
        "https://example.com/unowned.html";
    }),
    changed((payload) => {
      payload.records[0].app_store_id =
        payload.records.find(
          (record) => record.app_key !== payload.records[0].app_key,
        ).app_store_id;
    }),
  ];
  for (const payload of cases) {
    assert.throws(() => validateSnapshotCatalog(payload));
  }
});

test("catalog digest rejects unacknowledged record changes", () => {
  const payload = structuredClone(catalog);
  payload.records[0].publisher_query += " altered";
  assert.throws(
    () => validateSnapshotCatalog(payload),
    /content digest/u,
  );
});
