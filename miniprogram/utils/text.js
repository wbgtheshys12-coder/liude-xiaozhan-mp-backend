const WINDOWS_1252_BYTES = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f
};

const MOJIBAKE_MARKERS = /[ÃÂâäåæçèéïð]/;

function toLegacyByte(character) {
  const code = character.charCodeAt(0);
  if (code <= 0xff) return code;
  return WINDOWS_1252_BYTES[character];
}

function decodeLegacyRun(run) {
  if (!MOJIBAKE_MARKERS.test(run)) return run;
  const bytes = [];
  for (const character of run) {
    const byte = toLegacyByte(character);
    if (byte === undefined) return run;
    bytes.push(byte);
  }
  try {
    const encoded = bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
    const decoded = decodeURIComponent(encoded);
    const originalCjk = (run.match(/[\u3400-\u9fff]/g) || []).length;
    const decodedCjk = (decoded.match(/[\u3400-\u9fff]/g) || []).length;
    return decodedCjk > originalCjk && !decoded.includes("\ufffd") ? decoded : run;
  } catch (error) {
    return run;
  }
}

function repairMojibake(value) {
  if (typeof value !== "string" || !MOJIBAKE_MARKERS.test(value)) return value;
  let output = "";
  let legacyRun = "";

  const flush = () => {
    output += decodeLegacyRun(legacyRun);
    legacyRun = "";
  };

  for (const character of value) {
    if (toLegacyByte(character) !== undefined) {
      legacyRun += character;
    } else {
      flush();
      output += character;
    }
  }
  flush();
  return output;
}

function repairTextDeep(value) {
  if (typeof value === "string") return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairTextDeep);
  if (value && typeof value === "object") {
    const repaired = {};
    Object.keys(value).forEach((key) => {
      repaired[key] = repairTextDeep(value[key]);
    });
    return repaired;
  }
  return value;
}

module.exports = {
  repairMojibake,
  repairTextDeep
};
