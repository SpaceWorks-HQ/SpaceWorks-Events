import { GITHUB_REPO, GITHUB_URL, LICENSE_URL, UPSTREAM_URL } from "@/lib/openSource";
import { Container, SectionHeading } from "../primitives";

const linkClass = "inline-flex items-center gap-1 text-body-ui font-semibold text-ink underline underline-offset-4 hover:decoration-2";

function NewTab() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}

/** "Who makes it": Space Works, the licence, and the one upstream credit. */
export function SpaceWorksSection() {
  return (
    <section aria-labelledby="makers-title">
      <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
        <SectionHeading id="makers-title" overline="Who makes it" title="Made by Space Works, shared in the open" className="max-w-[820px]" />
        <ul className="grid gap-5 md:grid-cols-2">
          <li className="flex flex-col gap-5 rounded-[16px] bg-sw-citron p-6 text-sw-ink sm:p-8">
            <div className="flex flex-col gap-1">
              <p className="text-overline">The makers</p>
              <h3 className="text-h3">Space Works</h3>
            </div>
            <div className="flex flex-col gap-4 text-body-ui">
              <p>
                Space Works is a community of makers. We run meetups, workshops and build nights, and Space Works Events is the tool we built to run them: one place for the event page, the guest list, the door and the thank-you.
              </p>
              <p>We use it for our own events first, so every change has to survive a busy evening at the workshop.</p>
            </div>
          </li>

          <li className="flex flex-col gap-5 rounded-[16px] border border-line bg-panel p-6 sm:p-8">
            <div className="flex flex-col gap-1">
              <p className="text-overline text-ink-muted">Open source</p>
              <h3 className="text-h3 text-ink">Free to read, run and improve</h3>
            </div>
            <div className="flex flex-col gap-4 text-body-ui text-ink-secondary">
              <p>
                The code is published under the{" "}
                <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">
                  GNU AGPL-3.0 licence<NewTab />
                </a>
                . If you run a changed copy for other people, the licence asks you to share your changes with them too.
              </p>
              <p>
                Based on{" "}
                <a href={UPSTREAM_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">
                  Yuyu by Abhiram N J<NewTab />
                </a>
                .
              </p>
            </div>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={`${linkClass} mt-auto self-start`}>
              {GITHUB_REPO} on GitHub
              <NewTab />
            </a>
          </li>
        </ul>
      </Container>
    </section>
  );
}
