"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Bold, Heading, Italic, Link2, Link2Off, List, ListOrdered, Quote, Redo2, RemoveFormatting, Undo2 } from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

type Props = { name: string; label: string; defaultValue?: string; helperText?: string; minHeight?: number };

export function RichTextEditor({ name, label, defaultValue = "", helperText, minHeight = 120 }: Props) {
  const labelId = useId();
  const helperId = useId();
  const [html, setHtml] = useState(defaultValue);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [2, 3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https:" }),
    ],
    content: defaultValue,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "yy-prose px-3.5 py-3 text-ink focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        ...(helperText ? { "aria-describedby": helperId } : {}),
      },
    },
    onUpdate: ({ editor: currentEditor }) => setHtml(currentEditor.getHTML()),
  });
  useEffect(() => { if (editor && editor.getHTML() !== defaultValue) editor.commands.setContent(defaultValue); }, [defaultValue, editor]);
  const button = (buttonLabel: string, active: boolean, action: () => void, icon: ReactNode) => (
    <button
      type="button"
      aria-label={buttonLabel}
      title={buttonLabel}
      aria-pressed={active}
      onClick={action}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-ink-secondary transition-colors duration-[180ms] ease-yy hover:bg-muted hover:text-ink [&_svg]:size-[18px]",
        active && "bg-primary text-on-primary hover:bg-primary hover:text-on-primary",
      )}
    >
      {icon}
    </button>
  );
  const openLinkDialog = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setLinkText(editor.state.doc.textBetween(from, to, " "));
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkError("");
    setLinkDialogOpen(true);
  };
  const applyLink = () => {
    if (!editor) return;
    const href = linkUrl.trim();
    try {
      const protocol = href.startsWith("mailto:") ? "mailto:" : new URL(href).protocol;
      if (!href || !["http:", "https:", "mailto:"].includes(protocol)) throw new Error();
    } catch {
      setLinkError("Enter a valid http(s) URL or mailto: address.");
      return;
    }
    if (editor.state.selection.empty) {
      if (!linkText.trim()) {
        setLinkError("Enter the text to display for this link.");
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: linkText.trim(), marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDialogOpen(false);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-label text-ink">{label}</span>
      <input type="hidden" name={name} value={html} readOnly />
      <div className="overflow-hidden rounded-md border border-line-strong bg-canvas transition-colors focus-within:border-[var(--yy-focus)]">
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-0.5 border-b border-line bg-subtle p-1">
          {button("Heading", editor?.isActive("heading") ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), <Heading />)}
          {button("Bold", editor?.isActive("bold") ?? false, () => editor?.chain().focus().toggleBold().run(), <Bold />)}
          {button("Italic", editor?.isActive("italic") ?? false, () => editor?.chain().focus().toggleItalic().run(), <Italic />)}
          {button("Bulleted list", editor?.isActive("bulletList") ?? false, () => editor?.chain().focus().toggleBulletList().run(), <List />)}
          {button("Numbered list", editor?.isActive("orderedList") ?? false, () => editor?.chain().focus().toggleOrderedList().run(), <ListOrdered />)}
          {button("Quote", editor?.isActive("blockquote") ?? false, () => editor?.chain().focus().toggleBlockquote().run(), <Quote />)}
          {button("Add or edit link", editor?.isActive("link") ?? false, openLinkDialog, <Link2 />)}
          {button("Remove link", false, () => editor?.chain().focus().unsetLink().run(), <Link2Off />)}
          {button("Undo", false, () => editor?.chain().focus().undo().run(), <Undo2 />)}
          {button("Redo", false, () => editor?.chain().focus().redo().run(), <Redo2 />)}
          {button("Clear formatting", false, () => editor?.chain().focus().clearNodes().unsetAllMarks().run(), <RemoveFormatting />)}
        </div>
        <div style={{ ["--rte-min-height" as string]: `${minHeight}px` }} className="[&_.ProseMirror]:min-h-[var(--rte-min-height)] [&_.ProseMirror_a]:cursor-pointer">
          <EditorContent editor={editor} />
        </div>
      </div>
      {helperText ? <p id={helperId} className="text-caption text-ink-muted">{helperText}</p> : null}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader title="Add link" />
          <DialogBody className="flex flex-col gap-4">
            {linkError ? <Callout tone="danger" role="alert">{linkError}</Callout> : null}
            {editor?.state.selection.empty ? (
              <Field label="Link text">
                <Input value={linkText} onChange={(event) => setLinkText(event.target.value)} autoFocus />
              </Field>
            ) : null}
            <Field label="URL" helperText="HTTP(S) and mailto: links are supported.">
              <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.com" autoFocus={!editor?.state.selection.empty} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={applyLink}>Add link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
