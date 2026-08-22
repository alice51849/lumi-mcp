import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function assertActionsArePinned(workflow) {
  const references = [
    ...workflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s#]+)/gmu),
  ].map((match) => match[1]);
  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.match(reference, /^[a-f0-9]{40}$/u);
  }
}

test("CI builds only after quality gates and never pushes the OCI shadow", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/ci.yml", root),
    "utf8",
  );
  const catalogGate = workflow.indexOf("Gate authoritative live catalog");
  const tests = workflow.indexOf("Test server and generated artifacts");
  const ociJob = workflow.indexOf("oci-shadow:");
  const multiarch = workflow.indexOf("Build multi-architecture OCI shadow");
  const smoke = workflow.indexOf("Verify metadata, size, and MCP by image digest");
  assert.ok(catalogGate >= 0 && tests > catalogGate);
  assert.ok(ociJob > tests && multiarch > ociJob && smoke > multiarch);
  assert.match(workflow, /oci-shadow:\n\s+needs: quality/u);
  assert.match(workflow, /platforms: linux\/amd64,linux\/arm64/u);
  assert.match(workflow, /push: false/u);
  assert.doesNotMatch(workflow, /push: true/u);
  assert.match(workflow, /sbom: true/u);
  assert.match(workflow, /provenance: mode=max/u);
  assert.match(
    workflow,
    /uses: actions\/attest@[a-f0-9]{40} # v4/u,
  );
  assert.match(workflow, /"\$image_id"$/mu);
  assert.match(workflow, /server\.release\.json/u);
  assert.doesNotMatch(workflow, /setup-qemu-action/u);
  assert.match(workflow, /version: v0\.36\.1/u);
  assert.match(
    workflow,
    /image=moby\/buildkit@sha256:[a-f0-9]{64}/u,
  );
  assert.match(workflow, /syft-version: v1\.51\.0/u);
  assertActionsArePinned(workflow);
});

test("release and Registry publication fail closed behind every supply-chain gate", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/publish.yml", root),
    "utf8",
  );
  const publicPackage = workflow.indexOf(
    "Require an existing public GHCR package",
  );
  const anonymousBootstrap = workflow.indexOf(
    "Verify an anonymous bootstrap pull",
  );
  const catalogGate = workflow.indexOf("Gate authoritative live catalog");
  const tests = workflow.indexOf("Test server and generated artifacts");
  const image = workflow.indexOf(
    "Build and push commit-scoped candidate image",
  );
  const anonymousPull = workflow.indexOf(
    "Verify anonymous candidate and digest pulls",
  );
  const ownership = workflow.indexOf(
    "Verify architectures, ownership, labels, and size",
  );
  const smoke = workflow.indexOf(
    "Smoke immutable image digest across 50 locales",
  );
  const attestations = workflow.indexOf(
    "Verify signed provenance and SBOM attestations",
  );
  const promotion = workflow.indexOf(
    "Promote verified digest to the semver tag",
  );
  const release = workflow.indexOf(
    "Publish verified GitHub release assets",
  );
  const registryValidation = workflow.indexOf(
    "Validate all public Registry packages",
  );
  const registryReconcile = workflow.indexOf(
    "Reconcile an existing immutable Registry version",
  );
  const registryPublish = workflow.indexOf(
    "Publish to the official MCP Registry",
  );
  assert.ok(catalogGate >= 0 && tests > catalogGate);
  assert.ok(
    publicPackage >= 0 &&
      anonymousBootstrap > publicPackage &&
      image > anonymousBootstrap,
  );
  assert.ok(image > tests);
  assert.ok(anonymousPull > image);
  assert.ok(ownership > anonymousPull);
  assert.ok(smoke > ownership);
  assert.ok(attestations > smoke);
  assert.ok(promotion > attestations);
  assert.ok(release > promotion);
  assert.ok(registryValidation > release);
  assert.ok(registryReconcile > registryValidation);
  assert.ok(registryPublish > registryReconcile);
  assert.match(workflow, /publish:\n\s+needs: quality/u);
  assert.match(workflow, /docker logout ghcr\.io/u);
  assert.match(workflow, /visibility !== "public"/u);
  assert.match(
    workflow,
    /DOCKER_CONFIG: \$\{\{ runner\.temp \}\}\/lumi-anonymous-docker/u,
  );
  assert.match(workflow, /steps\.metadata\.outputs\.candidate/u);
  assert.match(
    workflow,
    /imagetools create[\s\S]+--tag "\$\{IMAGE_NAME\}:\$\{VERSION\}"/u,
  );
  assert.match(workflow, /subject-digest: \$\{\{ steps\.image\.outputs\.digest \}\}/u);
  assert.match(workflow, /predicate-type https:\/\/spdx\.dev\/Document\/v2\.3/u);
  assert.match(workflow, /cp server\.release\.json server\.json/u);
  assert.match(workflow, /verify-registry-version\.mjs/u);
  assert.equal(
    (workflow.match(/--data-urlencode "version=\$\{VERSION\}"/gmu) ?? [])
      .length,
    3,
  );
  assert.equal(
    (workflow.match(/\.\/mcp-publisher publish/gmu) ?? []).length,
    1,
  );
  assert.doesNotMatch(workflow, /setup-qemu-action/u);
  assert.match(workflow, /version: v0\.36\.1/u);
  assert.match(
    workflow,
    /image=moby\/buildkit@sha256:[a-f0-9]{64}/u,
  );
  assert.match(workflow, /syft-version: v1\.51\.0/u);
  assert.doesNotMatch(workflow, /continue-on-error/u);
  assert.doesNotMatch(workflow, /openai/iu);
  assertActionsArePinned(workflow);
});
