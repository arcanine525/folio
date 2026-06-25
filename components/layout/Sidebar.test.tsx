import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetOpfs } from "@/__mocks__/opfs";
import * as opfs from "@/lib/opfs";
import { __resetRootForTests } from "@/lib/opfs";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAppStore } from "@/store/appStore";

function resetStore() {
  useAppStore.setState({
    tree: [],
    activeFileId: null,
    content: "",
    savedContent: "",
  });
}

describe("Sidebar", () => {
  beforeEach(async () => {
    __resetOpfs();
    await __resetRootForTests();
    resetStore();
  });

  it("renders the header, new-file button, and upload footer", () => {
    render(<Sidebar />);
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New file" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload audio / transcript" }),
    ).toBeInTheDocument();
  });

  it("renders files scanned from OPFS", async () => {
    await opfs.writeFile("alpha.md", "");
    await opfs.createFolder("notes");
    render(<Sidebar />);
    await waitFor(() => expect(screen.getByText("alpha.md")).toBeInTheDocument());
    expect(screen.getByText("notes")).toBeInTheDocument();
  });

  it("opens the inline input when the new-file button is clicked", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New file" }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("sets the active file when a file row is clicked", async () => {
    const user = userEvent.setup();
    await opfs.writeFile("pick.md", "");
    render(<Sidebar />);
    await waitFor(() => expect(screen.getByText("pick.md")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "pick.md" }));
    expect(useAppStore.getState().activeFileId).toBe("pick.md");
  });

  it("shows the storage banner when usage exceeds the threshold", async () => {
    vi.spyOn(navigator.storage, "estimate").mockResolvedValue({
      usage: 900,
      quota: 1000,
    });
    render(<Sidebar />);
    await waitFor(() =>
      expect(
        screen.getByText("Storage 80%+ full. Export vault to free space."),
      ).toBeInTheDocument(),
    );
  });
});
