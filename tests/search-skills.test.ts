import assert from "node:assert/strict";
import test from "node:test";
import { getSkill, getSkills, resolveSkillAssets } from "../server/content/skills";
import { searchDocuments } from "../server/search/indexer";

test("search returns fixture document hits and excludes skill bodies", () => {
  const results = searchDocuments("Bearer token", ["technology-sdks-example-sdk"], 5);
  assert.ok(results.some((result) => result.uri.includes("authentication")));
  assert.equal(
    results.some((result) => result.uri.includes("/skills/")),
    false,
  );
});

test("technology skills are cataloged with companion resources", () => {
  const skills = getSkills("technology");
  const skill = skills.find((candidate) => candidate.capability === "documentation-review");
  assert.ok(skill);
  assert.equal(skill.delivery, "inline");
  assert.equal(resolveSkillAssets(skill).length, 1);
});

test("install-delivery skills expose install metadata", () => {
  const skill = getSkill("projects/skills/custom/project-brief");
  assert.ok(skill);
  assert.equal(skill.delivery, "install");
  assert.match(skill.install?.command ?? "", /skills add/);
});
