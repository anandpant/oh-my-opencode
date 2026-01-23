import { describe, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { resolveSubagentDirectory } from "./agent-directory"

describe("resolveSubagentDirectory", () => {
  test("#given librarian agent #when resolving directory #then use temp dir", () => {
    // #given
    const parentDirectory = "/repo/path"

    // #when
    const result = resolveSubagentDirectory("librarian", parentDirectory)

    // #then
    expect(result).toBe(tmpdir())
  })

  test("#given uppercase Librarian agent #when resolving directory #then use temp dir", () => {
    // #given
    const parentDirectory = "/repo/path"

    // #when
    const result = resolveSubagentDirectory("Librarian", parentDirectory)

    // #then
    expect(result).toBe(tmpdir())
  })

  test("#given non-librarian agent #when resolving directory #then use parent directory", () => {
    // #given
    const parentDirectory = "/repo/path"

    // #when
    const result = resolveSubagentDirectory("explore", parentDirectory)

    // #then
    expect(result).toBe(parentDirectory)
  })
})
