import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const syftSha256 =
  "2a2e837a2c8d59ec9af5472ee22d3b04ee463c4e44476ecf993fd1e5ab6ebc7f";

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
  const bootstrapJob = workflow.indexOf("ghcr-bootstrap:");
  const multiarch = workflow.indexOf("Build multi-architecture OCI shadow");
  const smoke = workflow.indexOf("Verify metadata, size, and MCP by image digest");
  assert.ok(catalogGate >= 0 && tests > catalogGate);
  assert.ok(
    ociJob > tests &&
      multiarch > ociJob &&
      smoke > multiarch &&
      bootstrapJob > smoke,
  );
  const shadowWorkflow = workflow.slice(ociJob, bootstrapJob);
  assert.match(workflow, /oci-shadow:\n\s+needs: quality/u);
  assert.match(shadowWorkflow, /platforms: linux\/amd64,linux\/arm64/u);
  assert.match(shadowWorkflow, /push: false/u);
  assert.doesNotMatch(shadowWorkflow, /push: true/u);
  assert.match(shadowWorkflow, /sbom: true/u);
  assert.match(shadowWorkflow, /provenance: mode=max/u);
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
  assert.match(workflow, /bash scripts\/install-syft\.sh/u);
  assert.match(workflow, /\$\{RUNNER_TEMP\}\/lumi-syft-bin\/syft/u);
  assert.doesNotMatch(workflow, /anchore\/sbom-action/u);
  assertActionsArePinned(workflow);
});

test("GHCR bootstrap is manual, commit-scoped, and fully gated", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/ci.yml", root),
    "utf8",
  );
  const bootstrapJob = workflow.indexOf("ghcr-bootstrap:");
  assert.ok(bootstrapJob >= 0);
  const bootstrap = workflow.slice(bootstrapJob);
  assert.match(
    workflow,
    /workflow_dispatch:[\s\S]+bootstrap_ghcr:[\s\S]+type: boolean/u,
  );
  assert.match(
    bootstrap,
    /if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.bootstrap_ghcr \}\}/u,
  );
  assert.match(bootstrap, /needs: \[quality, oci-shadow\]/u);
  assert.match(
    bootstrap,
    /concurrency:[\s\S]+group: lumi-mcp-ghcr-bootstrap[\s\S]+cancel-in-progress: false/u,
  );
  assert.match(bootstrap, /candidate=bootstrap-\$\{GITHUB_SHA::12\}/u);
  assert.match(
    bootstrap,
    /outputs: type=image,name=\$\{\{ env\.IMAGE_NAME \}\},push-by-digest=true,name-canonical=true,push=true/u,
  );
  assert.match(bootstrap, /platforms: linux\/amd64,linux\/arm64/u);
  assert.match(bootstrap, /Smoke immutable bootstrap digest across 50 locales/u);
  assert.match(bootstrap, /Verify signed bootstrap provenance and SBOM attestations/u);
  assert.match(bootstrap, /case "\$status" in[\s\S]+200\)[\s\S]+404\)[\s\S]+\*\)/u);
  assert.match(bootstrap, /Promote verified digest to commit tag/u);
  assert.match(bootstrap, /Reverify tag binding and package visibility/u);
  assert.match(bootstrap, /--format '\{\{ \.Manifest\.Digest \}\}'/u);
  assert.match(bootstrap, /test "\$tag_digest" = "\$DIGEST"/u);
  assert.match(
    bootstrap,
    /case "\$visibility" in[\s\S]+private\)[\s\S]+public\)[\s\S]+\*\)/u,
  );
  assert.match(
    bootstrap,
    /DOCKER_CONFIG="\$anonymous_config"[\s\S]+docker pull "\$\{IMAGE_NAME\}:\$\{CANDIDATE\}"/u,
  );
  assert.match(
    bootstrap,
    /DOCKER_CONFIG="\$anonymous_config"[\s\S]+docker pull "\$\{IMAGE_NAME\}@\$\{DIGEST\}"/u,
  );
  assert.doesNotMatch(bootstrap, /server\.release\.json/u);
  assert.doesNotMatch(bootstrap, /Promote verified digest to the semver tag/u);
  assert.doesNotMatch(bootstrap, /gh release/u);
  assert.doesNotMatch(bootstrap, /mcp-publisher/u);
  assert.doesNotMatch(bootstrap, /setup-qemu-action/u);
  assertActionsArePinned(bootstrap);
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
  assert.match(workflow, /test "\$candidate_digest" = "\$DIGEST"/u);
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
  assert.match(workflow, /bash scripts\/install-syft\.sh/u);
  assert.match(workflow, /\$\{RUNNER_TEMP\}\/lumi-syft-bin\/syft/u);
  assert.doesNotMatch(workflow, /anchore\/sbom-action/u);
  assert.doesNotMatch(workflow, /continue-on-error/u);
  assert.doesNotMatch(workflow, /openai/iu);
  assertActionsArePinned(workflow);
});

test("Syft installation verifies the immutable release asset", async () => {
  const installer = await readFile(
    new URL("scripts/install-syft.sh", root),
    "utf8",
  );
  assert.match(installer, /version="1\.51\.0"/u);
  assert.match(installer, new RegExp(syftSha256, "u"));
  assert.match(installer, /\.createHash\("sha256"\)/u);
  assert.match(installer, /actual !== expected/u);
  assert.match(
    installer,
    /github\.com\/anchore\/syft\/releases\/download\/v\$\{version\}/u,
  );
  assert.doesNotMatch(installer, /install\.sh/u);
});
