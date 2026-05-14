/**
 * Setup Block — Probe Tools workflow
 *
 * Demonstrates the `setup:` block in solidactions.yaml.
 *
 * The yaml declares:
 *   setup:
 *     apk: [ffmpeg]
 *     pip: [dbt-core]
 *
 * That gives this workflow's sandbox image:
 *   - ffmpeg (installed via Alpine's apk package manager)
 *   - dbt-core (installed via pip, with python3 + py3-pip auto-installed
 *     first because pip is non-empty and python3 wasn't in apk)
 *
 * This workflow probes each tool by calling it as a subprocess from
 * inside a durable step. Returns the versions captured from each.
 */

import { SolidActions } from "@solidactions/sdk";
import { execa } from "execa";

interface ProbeOutput {
  ffmpeg: string;
  dbt: string;
  python: string;
}

/**
 * Run a CLI binary inside a durable step. The step name appears in the
 * SolidActions UI; if the workflow is interrupted, the captured result
 * is replayed on resume.
 */
async function probe(name: string, command: string, args: string[]): Promise<string> {
  return SolidActions.runStep(
    async () => {
      // `execa` is the recommended subprocess library for SolidActions
      // workflows — promise-based, captures stdout + stderr, throws on
      // non-zero exit. Combine both streams since some CLIs (e.g. dbt)
      // write version banners to stderr.
      const { stdout, stderr } = await execa(command, args);
      const combined = `${stdout}\n${stderr}`.trim();
      return combined.split("\n")[0] ?? "";
    },
    { name },
  );
}

async function probeToolsWorkflow(): Promise<ProbeOutput> {
  SolidActions.logger.info("Probing installed CLI tools");

  const ffmpeg = await probe("probe-ffmpeg", "ffmpeg", ["-version"]);
  const dbt = await probe("probe-dbt", "dbt", ["--version"]);
  // Direct python3 call proves the auto-bootstrapped interpreter is on PATH
  // even though we only declared setup.pip (not setup.apk: [python3]).
  const python = await probe("probe-python", "python3", [
    "-c",
    'import sys; print(f"python {sys.version_info.major}.{sys.version_info.minor}")',
  ]);

  return { ffmpeg, dbt, python };
}

const workflow = SolidActions.registerWorkflow(probeToolsWorkflow, {
  name: "probe-tools",
});

SolidActions.run(workflow);
