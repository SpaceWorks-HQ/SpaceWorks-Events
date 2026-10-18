import { DotFace } from "@/components/brand/DotFace";
import { ThemedImage } from "@/components/ui/themed-image";
import { Container, SectionHeading } from "../primitives";

const PORTFOLIO_URL = "https://abhiramnj.com";
const IDLISTACK_URL = "https://idlistack.com";

const linkClass = "inline-flex items-center gap-1 text-body-ui font-semibold text-ink underline underline-offset-4 hover:decoration-2";

function NewTab() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}

/** "Who makes Yuyu": the maker and the infrastructure this copy of Yuyu runs on. */
export function MakerSection() {
  return (
    <section aria-labelledby="makers-title">
      <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
        <SectionHeading
          id="makers-title"
          overline="Who makes Yuyu"
          title={
            <>
              Built by{" "}
              <a href="https://abhiramnj.com" target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-[6px] transition-[text-decoration-thickness] hover:decoration-[3px]">
                Abhiram<span className="sr-only"> (opens in a new tab)</span>
              </a>
              , hosted on{" "}
              <a href="https://idlistack.com" target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-[6px] transition-[text-decoration-thickness] hover:decoration-[3px]">
                IdliStack<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          }
          className="max-w-[820px]"
        />
        <ul className="grid gap-5 md:grid-cols-2">
          {/* The maker */}
          <li className="flex flex-col gap-5 rounded-[24px] bg-tint-peach p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <DotFace mood="happy" size={64} />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-overline text-ink-muted">The maker</p>
                <h3 className="text-h4 text-ink">Abhiram N J</h3>
                <p className="text-body-ui text-ink-secondary">Engineer at Tech4Good Community</p>
              </div>
            </div>
            <div className="flex flex-col gap-4 text-body-ui text-ink-secondary">
              <p>
                “I’m an engineer at Tech4Good Community and one among the many behind IdliStack. I’m also building Yuyu as a calmer way to bring people together, making free events easier to organise without turning every gathering into a transaction.”
              </p>
              <p>
                Yuyu is shaped by Abhiram’s product decisions and built with the help of AI tools. They help explore ideas and accelerate implementation, while the care, trade-offs, and responsibility stay human.
              </p>
            </div>
            <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className={`${linkClass} mt-auto self-start`}>
              Visit Abhiram’s portfolio
              <NewTab />
            </a>
          </li>

          {/* Hosted on IdliStack */}
          <li className="flex flex-col gap-5 rounded-[24px] border border-line bg-subtle p-6 sm:p-8">
            <div className="flex flex-col gap-3">
              <p className="text-overline text-ink-muted">Hosted on</p>
              <ThemedImage
                src="/brand/idlistack-logo-black.png"
                darkSrc="/brand/idlistack-logo-white.png"
                alt="IdliStack"
                width={134}
                height={48}
                className="h-12 w-auto max-w-full self-start object-contain"
              />
            </div>
            <div className="flex flex-col gap-4 text-body-ui text-ink-secondary">
              <p>
                This copy of Yuyu runs on IdliStack, digital infrastructure that hosts and runs powerful open-source tools with just one click.
              </p>
              <p>No servers to manage, no deployment struggles, just affordable software without tiered limits.</p>
            </div>
            <a href={IDLISTACK_URL} target="_blank" rel="noopener noreferrer" className={`${linkClass} mt-auto self-start`}>
              Visit IdliStack
              <NewTab />
            </a>
          </li>
        </ul>
      </Container>
    </section>
  );
}
