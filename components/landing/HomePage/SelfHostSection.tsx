import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/ui/github-mark";
import { INSTALL_SCRIPT_URL, LICENSE_URL, SETUP_GUIDE_URL, GITHUB_URL } from "@/lib/openSource";
import { InstallCommand } from "../InstallCommand";
import { Container, IconTile } from "../primitives";
import { installed, openLinks } from "./content";

export function SelfHostSection() {
  return (
    <section id="self-host" aria-labelledby="self-host-title" className="scroll-mt-20 border-y border-line bg-surface">
      <Container className="grid items-center gap-12 pb-12 pt-16 lg:grid-cols-2 lg:gap-14 lg:pb-14 lg:pt-[88px]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-overline text-ink-muted">Self-host</p>
            <h2 id="self-host-title" className="text-display-m text-ink">Run it on your own server</h2>
            <p className="text-body-l text-ink-secondary">Your guest lists stay with you. One command installs the whole stack on a Linux server, and every organisation on your install is kept separate from the others.</p>
          </div>
          <InstallCommand />
          <p className="text-body-ui text-ink-secondary">
            On a 64-bit Linux server with 2 GB of memory, as root or a user with sudo. It asks every question first and changes nothing until you confirm.{" "}
            <a href={INSTALL_SCRIPT_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">Read install.sh</a>
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="primary">
              <a href={SETUP_GUIDE_URL} target="_blank" rel="noopener noreferrer">Read the setup guide</a>
            </Button>
            <Button asChild variant="secondary">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"><GitHubMark />View on GitHub</a>
            </Button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[552px] overflow-hidden rounded-[16px] border border-line bg-panel lg:mx-0 lg:justify-self-end">
          <p className="border-b border-line px-5 py-3.5 text-label text-ink">What you get</p>
          <dl className="py-2">
            {installed.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-label text-ink">{label}</dt>
                <dd className="text-right text-[14px] font-medium text-ink-muted">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
      {/* Built in the open */}
      <Container className="flex flex-col gap-8 pb-16 lg:pb-[88px]">
        <div className="flex flex-col gap-2 border-t border-line pt-12 lg:pt-14">
          <p className="text-overline text-ink-muted">Open source</p>
          <h3 className="text-h2 text-ink">Built in the open</h3>
          <p className="max-w-[680px] text-body-l text-ink-secondary">
            Every line is public on GitHub under the{" "}
            <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">AGPL-3.0 licence</a>
            . Read how it works, tell us what is missing, or help build it.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {openLinks.map(({ title, body, href, Icon }) => (
            <li key={title}>
              <a href={href} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col gap-3 rounded-[16px] border border-line bg-panel p-6 transition-colors hover:border-line-strong">
                <IconTile icon={Icon} tone="citron" />
                <span className="text-h4 text-ink underline-offset-4 group-hover:underline">{title}</span>
                <span className="text-body-ui text-ink-secondary">{body}</span>
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
