import {
  A6_PORTRAIT,
  DEFAULT_LAYOUT_FLAGS,
  DEFAULT_WATERMARK,
  ID_CARD_LINE_HEIGHT,
  PT_TO_MM,
  type IdCardElementBold,
  type IdCardElementPositions,
  type IdCardElementSizes,
  type IdCardElementTextSizes,
  type IdCardLayoutElement,
  type IdCardLayoutFlags,
  type IdCardPrintSettings,
} from "./model";
import {
  bandInsetMm,
  clamp,
  estimateHeaderHeightMm,
  idCardTemplateDecor,
  marginMm,
  nameBlockHeightMm,
  paperScale,
  round1,
  sponsorStripHeightMm,
  symbolClearSpaceMm,
} from "./geometry";

/**
 * Default boxes for a template on the given paper. Tuned on A6 portrait;
 * other stock scales margins and type with the paper. Content stacks from the
 * top (heading, photo, name, email, answers); the QR sits in the bottom-right
 * corner, and the Space Works symbol and footer along the bottom-left, so
 * nothing overlaps on any preset.
 */
function defaultGeometry(template: IdCardPrintSettings["template"], widthMm: number, heightMm: number, flags: IdCardLayoutFlags) {
  const k = paperScale(widthMm, heightMm);
  const m = marginMm(k);
  const decor = idCardTemplateDecor(template, widthMm, heightMm);
  const text = defaultIdCardElementTextSizes(template, widthMm, heightMm);
  const line = (pt: number) => pt * PT_TO_MM * ID_CARD_LINE_HEIGHT.body;
  const width = (mm: number) => Math.max(20, round1(mm));

  const qrSize = Math.min(40, Math.max(16, round1((template === "minimal" ? 21 : 24) * k)));
  const logoSize = Math.min(20, Math.max(10, round1((template === "minimal" ? 10 : 12) * k)));
  const symbolSize = clamp(round1(9 * k), 7, 14);
  const photoSize = clamp(round1(24 * k), 12, 34);
  // The QR block has 1 mm of white padding; align the code itself with the margin.
  const qr = { xMm: round1(widthMm - m - qrSize - 1), yMm: round1(heightMm - m - qrSize - 1) };
  const qrLeft = qr.xMm + 1;

  const inset = bandInsetMm(k);
  const header = decor.band ? { xMm: inset, yMm: inset } : { xMm: m, yMm: m };
  const textX = decor.band ? round1(inset + decor.band.padXMm) : m;
  const leftOfQr = qrLeft - textX - 4 * k;

  // Bold keeps the band clean: its logo sits beside the QR at the bottom, or
  // above the QR when the card is too narrow to share the bottom row.
  let logo = { xMm: round1(widthMm - m - logoSize), yMm: m };
  let footerWidth = leftOfQr;
  let sponsorsWidth = leftOfQr;
  if (template === "bold") {
    const besideX = qrLeft - 4 * k - logoSize;
    if (besideX - textX - 3 * k >= 30) {
      logo = { xMm: round1(besideX), yMm: round1(heightMm - m - logoSize) };
      footerWidth = besideX - textX - 3 * k;
      if (flags.showLogo) sponsorsWidth = footerWidth;
    } else {
      logo = { xMm: round1(widthMm - m - logoSize), yMm: round1(qr.yMm + 1 - 3 * k - logoSize) };
    }
  }

  // The event logo sits at the top right, to the left of the organisation
  // logo when that also sits up there; the heading stops short of both.
  const logoAtTop = template !== "bold" && flags.showLogo;
  const eventLogo = template === "bold"
    ? { xMm: round1(widthMm - inset - logoSize), yMm: inset }
    : { xMm: round1(logoAtTop ? logo.xMm - 3 * k - logoSize : widthMm - m - logoSize), yMm: m };
  const headerRight = flags.showEventLogo
    ? (template === "bold" ? eventLogo.xMm - 2 * k : eventLogo.xMm - 4 * k)
    : (template === "bold" ? widthMm - inset : logo.xMm - 4 * k);
  const headerWidth = decor.band ? width(headerRight - inset) : width(headerRight - textX);

  // Footer row: the symbol, its clear space, then the footer text beside it.
  // On narrow stock the footer needs the whole row, so the symbol stands above it.
  const footerLine = line(text.footer);
  const symbolGap = Math.max(symbolClearSpaceMm(symbolSize), round1(2 * k));
  const besideFooter = footerWidth - symbolSize - symbolGap >= 20;
  const plainFooter = { xMm: textX, yMm: round1(heightMm - m - footerLine) };
  const symbol = besideFooter
    ? { xMm: textX, yMm: round1(heightMm - m - symbolSize) }
    : { xMm: textX, yMm: round1(plainFooter.yMm - symbolGap - symbolSize) };
  const footer = flags.showSymbol && besideFooter
    ? { xMm: round1(textX + symbolSize + symbolGap), yMm: round1(heightMm - m - symbolSize / 2 - footerLine / 2) }
    : plainFooter;
  const footerRowTop = flags.showSymbol ? symbol.yMm : footer.yMm;
  const footerBoxWidth = flags.showSymbol && besideFooter ? footerWidth - symbolSize - symbolGap : footerWidth;

  const headerBottom = header.yMm + estimateHeaderHeightMm(template, text.header, widthMm, heightMm);
  const nameRatio = template === "bold" ? 0.26 : template === "minimal" ? 0.36 : 0.3;
  const landscape = widthMm > heightMm * 1.15;
  let nameY = round1(Math.max(headerBottom + (template === "minimal" ? 8 : 6) * k, heightMm * nameRatio));
  let contentX = textX;
  let photo = { xMm: textX, yMm: round1(headerBottom + 4 * k) };
  if (flags.showPhoto) {
    if (landscape) {
      // Landscape: the photo stands beside the name block.
      photo = { xMm: textX, yMm: nameY };
      contentX = round1(textX + photoSize + 3 * k);
    } else {
      // Portrait: the photo sits under the heading and the name below it.
      nameY = round1(photo.yMm + photoSize + 3 * k);
    }
  } else if (landscape) {
    photo = { xMm: textX, yMm: nameY };
  }
  const emailY = round1(nameY + nameBlockHeightMm(text.name) + 1.5 * k);
  // Member ID items stack under the email; event badges never turn them on,
  // so their layout is unchanged.
  const idNumberY = round1(emailY + line(text.email) + 2 * k);
  const validUntilY = round1(idNumberY + (flags.showIdNumber ? line(text.idNumber) + 1 * k : 0));
  const memberBottom = flags.showValidUntil ? validUntilY + line(text.validUntil) : flags.showIdNumber ? idNumberY + line(text.idNumber) : null;
  const detailsY = round1(memberBottom === null ? emailY + line(text.email) + 4 * k : memberBottom + 3 * k);

  // On landscape stock the QR sits beside the text, so text stops short of it.
  const full = widthMm - contentX - m;
  const nameWidth = width(landscape ? Math.min(full, leftOfQr - (contentX - textX)) : full);
  const sponsorsHeight = sponsorStripHeightMm(widthMm, heightMm);
  const sponsors = { xMm: textX, yMm: round1(footerRowTop - Math.max(2 * k, symbolGap) - sponsorsHeight) };

  const positions: IdCardElementPositions = {
    header,
    name: { xMm: contentX, yMm: nameY },
    email: { xMm: contentX, yMm: emailY },
    details: { xMm: contentX, yMm: detailsY },
    qr,
    footer,
    logo,
    eventLogo,
    symbol,
    photo,
    sponsors,
    idNumber: { xMm: contentX, yMm: idNumberY },
    validUntil: { xMm: contentX, yMm: validUntilY },
  };
  const sizes: IdCardElementSizes = {
    header: headerWidth,
    name: nameWidth,
    email: nameWidth,
    details: width(leftOfQr - (contentX - textX)),
    qr: qrSize,
    footer: width(footerBoxWidth),
    logo: logoSize,
    eventLogo: logoSize,
    symbol: symbolSize,
    photo: photoSize,
    sponsors: width(sponsorsWidth),
    idNumber: nameWidth,
    validUntil: nameWidth,
  };
  return { positions, sizes };
}

/** Where an optional item goes when it is turned on, without reflowing the rest. */
export function geometryWithOptionalDefaults(template: IdCardPrintSettings["template"], widthMm: number, heightMm: number, flags: IdCardLayoutFlags) {
  const base = defaultGeometry(template, widthMm, heightMm, flags);
  const optional: Array<[keyof IdCardLayoutFlags, IdCardLayoutElement]> = [
    ["showEventLogo", "eventLogo"], ["showSymbol", "symbol"], ["showPhoto", "photo"], ["showSponsors", "sponsors"],
    ["showIdNumber", "idNumber"], ["showValidUntil", "validUntil"],
  ];
  for (const [flag, element] of optional) {
    if (flags[flag]) continue;
    const enabled = defaultGeometry(template, widthMm, heightMm, { ...flags, [flag]: true });
    base.positions[element] = enabled.positions[element];
    base.sizes[element] = enabled.sizes[element];
  }
  return base;
}

export function defaultIdCardElementPositions(
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number,
  flags: IdCardLayoutFlags = DEFAULT_LAYOUT_FLAGS,
): IdCardElementPositions {
  return geometryWithOptionalDefaults(template, widthMm, heightMm, flags).positions;
}

export function defaultIdCardElementSizes(
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number = A6_PORTRAIT.heightMm,
  flags: IdCardLayoutFlags = DEFAULT_LAYOUT_FLAGS,
): IdCardElementSizes {
  return geometryWithOptionalDefaults(template, widthMm, heightMm, flags).sizes;
}

export function defaultIdCardElementBold(): IdCardElementBold {
  return {
    header: true, name: true, email: false, details: false, qr: false, footer: false, logo: false,
    eventLogo: false, symbol: false, photo: false, sponsors: false, idNumber: true, validUntil: false,
  };
}

export function defaultIdCardElementTextSizes(
  template: IdCardPrintSettings["template"] = "classic",
  widthMm: number = A6_PORTRAIT.widthMm,
  heightMm: number = A6_PORTRAIT.heightMm,
): IdCardElementTextSizes {
  // The name is always the largest thing on the card; the heading stays small.
  const base = template === "bold"
    ? { header: 14, name: 28, email: 10, details: 8.5, footer: 7.5, idNumber: 11, validUntil: 8.5 }
    : template === "minimal"
      ? { header: 10, name: 30, email: 9.5, details: 8.5, footer: 7.5, idNumber: 10, validUntil: 8.5 }
      : { header: 13, name: 30, email: 10, details: 8.5, footer: 7.5, idNumber: 11, validUntil: 8.5 };
  const k = paperScale(widthMm, heightMm);
  const scaled = (pt: number, min: number) => Math.max(min, Math.round(pt * k * 2) / 2);
  return {
    header: scaled(base.header, 6), name: scaled(base.name, 9), email: scaled(base.email, 6),
    details: scaled(base.details, 6), qr: 0, footer: scaled(base.footer, 6), logo: 0,
    eventLogo: 0, symbol: 0, photo: 0, sponsors: 0,
    idNumber: scaled(base.idNumber, 6), validUntil: scaled(base.validUntil, 6),
  };
}

export function defaultIdCardPrintSettings(eventTitle: string, organisationName = ""): IdCardPrintSettings {
  return {
    ...A6_PORTRAIT,
    heading: eventTitle.trim().slice(0, 120) || "Event attendee",
    badgeLabel: "ATTENDEE",
    showEmail: true,
    template: "classic",
    footerText: organisationName.trim().slice(0, 80) || "Event check-in",
    printFieldKeys: [],
    printFieldLabels: {},
    elementPositions: defaultIdCardElementPositions("classic", A6_PORTRAIT.widthMm, A6_PORTRAIT.heightMm),
    elementSizes: defaultIdCardElementSizes("classic", A6_PORTRAIT.widthMm, A6_PORTRAIT.heightMm),
    elementBold: defaultIdCardElementBold(),
    elementTextSizes: defaultIdCardElementTextSizes("classic"),
    gridSizeMm: 5,
    showGrid: true,
    nameAutoFit: true,
    showBadgeLabel: true,
    showFooter: true,
    colorMode: "colour",
    backgroundColor: "white",
    accentColor: "event",
    textColor: "auto",
    ...DEFAULT_LAYOUT_FLAGS,
    photoShape: "circle",
    sponsorLimit: 4,
    showName: true,
    showQr: true,
    showIdNumber: false,
    idNumberLabel: "ID",
    showValidUntil: false,
    validUntilLabel: "Valid until",
    watermark: { ...DEFAULT_WATERMARK },
  };
}
