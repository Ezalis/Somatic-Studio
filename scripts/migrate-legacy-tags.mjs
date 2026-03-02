#!/usr/bin/env node

/**
 * migrate-legacy-tags.mjs
 *
 * One-time migration: reads legacy AI tag data (originally from Gemini AI analysis),
 * maps filenames to Immich asset IDs, and writes SomaticStudio/* tags into Immich.
 *
 * Usage:
 *   IMMICH_API_KEY=xxx IMMICH_URL=http://192.168.50.66:2283 node scripts/migrate-legacy-tags.mjs
 *
 * Or on docker-01 (where Immich runs locally):
 *   IMMICH_API_KEY=xxx IMMICH_URL=http://localhost:2283 node scripts/migrate-legacy-tags.mjs
 */

const IMMICH_URL = process.env.IMMICH_URL || 'http://192.168.50.66:2283';
const IMMICH_API_KEY = process.env.IMMICH_API_KEY;
const ALBUM_NAME = 'SomaticStudio';
const TAG_PREFIX = 'SomaticStudio/';

if (!IMMICH_API_KEY) {
  console.error('ERROR: IMMICH_API_KEY environment variable is required.');
  process.exit(1);
}

// --- Embedded Legacy Data (from git show main:public/resources/AI-tags.json) ---

const LEGACY_DEFINITIONS = [
  { id: "abstract", label: "Abstract" },
  { id: "action", label: "Action / Speed" },
  { id: "aerial", label: "Aerial" },
  { id: "animal", label: "Animal" },
  { id: "architecture", label: "Architecture" },
  { id: "automotive", label: "Automotive" },
  { id: "autumn", label: "Autumn" },
  { id: "beach", label: "Beach" },
  { id: "black-and-white", label: "Black and White" },
  { id: "blue", label: "Blue / Cool Tones" },
  { id: "bohemian", label: "Bohemian / Boho" },
  { id: "candid", label: "Candid" },
  { id: "cinematic", label: "Cinematic" },
  { id: "city", label: "City / Urban" },
  { id: "close-up", label: "Close Up" },
  { id: "concert", label: "Concert / Music" },
  { id: "confident", label: "Confident / Strong" },
  { id: "dark", label: "Dark / Low Key" },
  { id: "dramatic", label: "Dramatic" },
  { id: "edgy", label: "Edgy / Alternative" },
  { id: "elegant", label: "Elegant" },
  { id: "fashion", label: "Fashion" },
  { id: "forest", label: "Forest" },
  { id: "futuristic", label: "Futuristic / Sci-Fi" },
  { id: "glamour", label: "Glamour" },
  { id: "golden-hour", label: "Golden Hour" },
  { id: "group", label: "Group" },
  { id: "indoor", label: "Indoor" },
  { id: "industrial", label: "Industrial" },
  { id: "intimate", label: "Intimate / Sensual" },
  { id: "joyful", label: "Joyful / Happy" },
  { id: "landscape", label: "Landscape" },
  { id: "man", label: "Man" },
  { id: "melancholic", label: "Melancholic / Pensive" },
  { id: "minimalist", label: "Minimalist" },
  { id: "moody", label: "Moody" },
  { id: "mountains", label: "Mountains" },
  { id: "mystical", label: "Mystical / Ethereal" },
  { id: "natural-light", label: "Natural Light" },
  { id: "nature", label: "Nature" },
  { id: "neon", label: "Neon / Cyberpunk" },
  { id: "night", label: "Night" },
  { id: "outdoor", label: "Outdoor" },
  { id: "playful", label: "Playful" },
  { id: "portrait", label: "Portrait" },
  { id: "red", label: "Red / Warm Tones" },
  { id: "retro", label: "Retro / Nostalgic" },
  { id: "romantic", label: "Romantic" },
  { id: "rustic", label: "Rustic" },
  { id: "serene", label: "Serene / Calm" },
  { id: "sky", label: "Sky" },
  { id: "smoke", label: "Smoke / Haze" },
  { id: "snow", label: "Snow / Winter" },
  { id: "soft-light", label: "Soft Light" },
  { id: "sport", label: "Sport / Action" },
  { id: "street", label: "Street Photography" },
  { id: "studio", label: "Studio" },
  { id: "summer", label: "Summer" },
  { id: "tattoo", label: "Tattoo" },
  { id: "travel", label: "Travel" },
  { id: "vibrant", label: "Vibrant / Colorful" },
  { id: "vintage", label: "Vintage" },
  { id: "water", label: "Water" },
  { id: "wilderness", label: "Wilderness" },
  { id: "woman", label: "Woman" },
];

const LEGACY_MAPPINGS = {
  "06EB67D5-C8AB-4AED-847B-863A46D922F2-27376-000010DC9DB04BB9.jpg": ["landscape","nature","mountains","autumn","outdoor","travel","serene","golden-hour","red","wilderness","soft-light"],
  "11518310-295E-47CD-81D5-8098EF2E82C7-1326-0000088C41FEDA90.jpg": ["portrait","woman","tattoo","indoor","fashion","intimate","playful","red","confident","natural-light"],
  "33B0A6F4-CCFE-4F0B-9E63-4A343F31DF6E-2142-00000277D0622F02 Edited.jpg": ["landscape","nature","mountains","water","outdoor","snow","sky","blue","wilderness","serene","cold"],
  "348BC101-3C68-47BC-B0F3-602CEF6F09F5-1448-000000F31FC826D8.jpg": ["nature","travel","landscape","black-and-white","outdoor","mountains","forest","wilderness","melancholic","dramatic","minimalist"],
  "48D66D08-A158-4085-9EBE-E7262405D1B5-1143-00000079C47CDDE3.jpg": ["nature","landscape","travel","moody","mountains","outdoor","serene","minimalist","smoke","melancholic","mystical"],
  "65F9357B-1CE4-4CE2-A877-136D70C9132D-2142-00000279AA767416 Edited.jpg": ["nature","landscape","water","snow","outdoor","sky","blue","cold","wilderness","serene","minimalist"],
  "72A21DCD-D790-4E73-A87C-B4636B046C2E-36284-000011230EDD261B.jpg": ["portrait","woman","summer","outdoor","water","tattoo","joyful","vibrant","candid","beach","natural-light"],
  "9336455B-5CE0-4C07-BBFF-15E92C3FDB1F-3885-000003A2E39ECA2D.jpg": ["summer","woman","outdoor","fashion","tattoo","water","candid","vintage","bohemian","retro","intimate","relaxed"],
  "A0869BC9-6A75-4F84-A893-27CDAAC02C0C-2142-00000279712842C2 Edited.jpg": ["landscape","nature","mountains","water","forest","outdoor","travel","wilderness","blue","serene","vibrant"],
  "B4C12506-6D32-4D80-B22A-36F9062B3E8F-5971-0000054A2E578B96.jpg": ["portrait","woman","outdoor","fashion","tattoo","nature","bohemian","serene","soft-light","mystical","elegant"],
  "BlueRidge0605.jpg": ["portrait","woman","fashion","studio","vintage","retro","soft-light","red","candid","elegant"],
  "BlueRidge0686(1).jpg": ["portrait","fashion","studio","woman","tattoo","neon","sensual","mystical","confident","dark","glamour"],
  "BlueRidge0756.jpg": ["portrait","black-and-white","woman","tattoo","candid","fashion","moody","intimate","melancholic","edgy","soft-light"],
  "BlueRidge0951.jpg": ["portrait","woman","moody","close-up","intimate","sensual","red","studio"],
  "BlueRidge1004.jpg": ["portrait","woman","fashion","studio","moody","abstract","confident","glamour","mystical","dramatic","vibrant"],
  "ChristmasDay0108.jpg": ["portrait","woman","indoor","fashion","tattoo","vintage","bohemian","red","elegant","romantic","dramatic"],
  "ConjuringTub026_Original.jpg": ["portrait","woman","studio","neon","abstract","fashion","intimate","soft-light","mystical","futuristic","sensual"],
  "ConjuringTub030_Original.jpg": ["portrait","fashion","indoor","neon","woman","abstract","glamour","futuristic","vibrant","intimate"],
  "DD8B1887-502C-4820-8793-768FC86C13B9-4424-0000028E6016092B.jpg": ["automotive","city","outdoor","street","travel","vintage","industrial","retro","urban","action"],
  "DSCF1321.JPG.jpeg": ["animal","indoor","black-and-white","vintage","serene","close-up","soft-light"],
  "DSCF1975 Edited.jpg": ["abstract","neon","architecture","indoor","city","futuristic","vibrant","cinematic","modern"],
  "DSCF2284 Edited.jpg": ["group","portrait","outdoor","summer","travel","candid","fashion","joyful","relaxed","bohemian","vacation"],
  "DSCF4847.jpg": ["black-and-white","nature","outdoor","water","moody","abstract","minimalist","melancholic","rustic","close-up"],
  "DSCF5018.jpg": ["summer","outdoor","water","candid","portrait","blue","relaxed","natural-light","contemplative"],
  "DSCF9237 Edited.jpg": ["city","street","candid","outdoor","abstract","urban","minimalist","melancholic","daylight"],
  "DownstairsApt075.jpg": ["portrait","studio","woman","neon","abstract","fashion","vibrant","futuristic","energetic","joyful"],
  "DownstairsApt078.jpg": ["portrait","fashion","studio","woman","neon","abstract","futuristic","vibrant","edgy","cinematic"],
  "DownstairsApt083.jpg": ["portrait","studio","fashion","woman","neon","abstract","tattoo","intimate","vibrant","sensual","mystical"],
  "DownstairsApt094.jpg": ["portrait","woman","studio","fashion","neon","abstract","group","vibrant","playful","futuristic","joyful"],
  "DownstairsApt102.jpg": ["portrait","woman","studio","abstract","neon","mystical","serene","vibrant","contemplative"],
  "DownstairsApt109.jpg": ["portrait","studio","abstract","woman","neon","playful","vibrant","futuristic","creative"],
  "DownstairsApt119.jpg": ["portrait","studio","abstract","woman","neon","mystical","dark","cinematic","melancholic"],
  "Equinox1229_Original.JPG": ["portrait","candid","woman","fashion","outdoor","bohemian","soft-light","natural-light","joyful","rustic"],
  "ErikaBlueRidge012_Original.jpg": ["portrait","outdoor","mountains","sky","woman","fashion","nature","bohemian","serene","blue","natural-light"],
  "ErikaBlueRidge020_Original.jpg": ["portrait","nature","outdoor","woman","mountains","fashion","tattoo","bohemian","golden-hour","serene","intimate"],
  "F38245A5-8A3E-4339-8DEB-70EB3C099233-82692-0000109EBFA5D8E4.jpg": ["portrait","black-and-white","fashion","studio","woman","tattoo","moody","vintage","edgy","confident","dramatic","gothic"],
  "F3EC557A-4DDB-463D-ABD0-ECE392BA901E-2142-00000151A666AE87 Edited.jpg": ["landscape","nature","mountains","travel","outdoor","sky","minimalist","cinematic","blue","wilderness","road-trip"],
  "F5FDB82E-D201-41DD-B0B7-37ADB00F886D-27376-000010DCA99BC6DC.jpg": ["autumn","landscape","nature","outdoor","sky","travel","vibrant","red","scenic","forest"],
  "FUJIFILM 0370.jpg": ["portrait","woman","studio","tattoo","fashion","minimalist","soft-light","serene","bohemian"],
  "FUJIFILM 0472.jpg": ["portrait","black-and-white","candid","woman","studio","joyful","intimate","natural-light"],
  "FebruaryPortrait1088 Edited.jpg": ["portrait","woman","abstract","studio","fashion","neon","edgy","futuristic","vibrant","mystical"],
  "FebruaryPortrait1161 Edited.jpg": ["portrait","black-and-white","studio","fashion","woman","tattoo","edgy","melancholic","alternative"],
  "FebruaryPortrait1214 Edited.jpg": ["portrait","fashion","studio","woman","tattoo","soft-light","close-up","confident","alternative"],
  "FormulaDrift059.jpg": ["automotive","sport","outdoor","travel","smoke","action","vibrant","cinematic","speed"],
  "GrandmasHat011.jpg": ["portrait","black-and-white","vintage","fashion","woman","studio","moody","elegant","retro","melancholic","classic"],
  "GrandmasHat012.jpg": ["portrait","fashion","vintage","moody","woman","studio","glamour","elegant","dark","retro"],
  "GrandmasHat022.jpg": ["black-and-white","portrait","woman","fashion","vintage","moody","intimate","close-up","elegant","nostalgic"],
  "GrandmasHat027.jpg": ["portrait","black-and-white","fashion","vintage","studio","woman","moody","dramatic","glamour","confident","retro"],
  "GrandmasHat034.jpg": ["portrait","fashion","tattoo","woman","studio","moody","dark","sensual","mystical","low-key"],
  "IMG_0001.JPG": ["landscape","nature","mountains","snow","outdoor","moody","blue","cold","dramatic","wilderness"],
  "IMG_0015.jpg": ["aviation","black-and-white","water","travel","outdoor","industrial","military","cinematic","ocean"],
  "IMG_0028.jpg": ["aviation","water","sky","outdoor","travel","minimalist","blue","serene","soft-light"],
  "IMG_0049.jpg": ["city","architecture","night","travel","neon","spring","vibrant","landmark","urban"],
  "IMG_0050.JPG": ["beach","summer","outdoor","woman","water","fashion","joyful","vibrant","action","fun"],
  "IMG_0057.jpg": ["abstract","neon","indoor","night","blue","futuristic","vibrant"],
  "IMG_0060.jpg": ["abstract","neon","indoor","vibrant","playful","futuristic","colorful"],
  "IMG_0061.jpg": ["architecture","abstract","indoor","neon","futuristic","metallic","vibrant","modern"],
  "IMG_0066 (1).jpg": ["outdoor","portrait","group","summer","candid","woman","forest","joyful","intimate","soft-light"],
  "IMG_0066.jpg": ["nature","abstract","indoor","vibrant","green","botanical"],
  "IMG_0067.jpg": ["portrait","nature","outdoor","woman","water","tattoo","forest","intimate","serene","rustic","natural-light"],
  "IMG_0090.jpg": ["portrait","outdoor","woman","water","summer","forest","tattoo","candid","soft-light","serene","intimate"],
  "IMG_0091.jpg": ["portrait","nature","outdoor","water","woman","candid","tattoo","forest","action","adventurous"],
  "IMG_0107.JPG": ["portrait","studio","woman","fashion","neon","tattoo","abstract","edgy","vibrant","alternative"],
  "IMG_0126.JPG": ["portrait","woman","abstract","fashion","concert","studio","neon","tattoo","vibrant","energetic","artistic"],
  "IMG_0161.JPG": ["vintage","automotive","abstract","rustic","close-up","industrial","blue"],
  "IMG_0175.JPG": ["portrait","woman","studio","fashion","abstract","tattoo","elegant","soft-light","glamour"],
  "IMG_0189.JPG": ["automotive","city","street","architecture","vintage","urban","moody","industrial"],
  "IMG_0196.JPG": ["portrait","abstract","studio","fashion","neon","woman","futuristic","glitch","dark","edgy"],
  "IMG_0215.JPG": ["portrait","abstract","fashion","neon","vibrant","futuristic","cyberpunk"],
  "IMG_0291.JPG": ["portrait","black-and-white","candid","woman","street","joyful","natural-light","urban"],
  "IMG_0310.JPG": ["portrait","black-and-white","woman","studio","fashion","tattoo","moody","confident","dramatic","edgy"],
  "IMG_0311.JPG": ["portrait","black-and-white","woman","studio","moody","fashion","tattoo","mystical","sensual","intimate"],
  "IMG_0313.JPG": ["portrait","black-and-white","woman","studio","group","moody","intimate","sensual","dramatic"],
  "IMG_0319.JPG": ["portrait","black-and-white","woman","studio","fashion","tattoo","moody","confident","bohemian","elegant"],
  "IMG_0320.JPG": ["black-and-white","indoor","moody","abstract","intimate","close-up","melancholic"],
  "IMG_0329.JPG": ["portrait","black-and-white","animal","woman","studio","tattoo","intimate","candid","soft-light"],
  "IMG_0331.JPG": ["portrait","black-and-white","fashion","studio","moody","woman","tattoo","elegant","mystical","sensual"],
  "IMG_0334.JPG": ["portrait","black-and-white","group","candid","moody","joyful","intimate","expressive"],
  "IMG_0336.JPG": ["portrait","black-and-white","candid","woman","group","indoor","joyful","intimate","soft-light"],
  "IMG_0341.JPG": ["portrait","black-and-white","animal","woman","tattoo","studio","intimate","bohemian","affectionate"],
  "IMG_0380.JPG": ["portrait","outdoor","autumn","fashion","woman","tattoo","nature","bohemian","warm-tones","golden-hour"],
  "IMG_0421.JPG": ["street","group","outdoor","city","candid","action","daylight"],
  "IMG_0424.JPG": ["landscape","outdoor","nature","sky","group","minimalist","serene","wide-angle"],
  "IMG_0506.JPG": ["black-and-white","outdoor","night","travel","automotive","sky","adventure","camping","moody"],
  "IMG_0560.JPG": ["night","beach","sky","nature","outdoor","moody","landscape","dark","mystical","serene"],
  "IMG_0568.JPG": ["beach","summer","outdoor","landscape","fashion","travel","woman","tattoo","water","relaxed","bohemian"],
  "IMG_0581.JPG": ["portrait","beach","summer","outdoor","candid","travel","water","tattoo","fashion","sky","joyful","carefree"],
  "IMG_0648.JPG": ["nature","forest","travel","outdoor","automotive","camping","adventure","green"],
  "IMG_0767.JPG": ["portrait","outdoor","autumn","fashion","tattoo","woman","bohemian","retro","warm-tones"],
  "IMG_0789.JPG": ["black-and-white","outdoor","nature","landscape","sky","candid","minimalist","serene","street"],
  "IMG_1026.JPG": ["portrait","woman","abstract","studio","neon","moody","dramatic","vibrant","cinematic"],
  "IMG_1030.JPG": ["portrait","studio","moody","woman","tattoo","neon","mystical","intimate","soft-light"],
  "IMG_1043.JPG": ["portrait","studio","fashion","abstract","indoor","neon","playful","costume","vibrant"],
  "IMG_1051.JPG": ["portrait","studio","moody","neon","fashion","abstract","dark","cinematic","night"],
  "IMG_1058.JPG": ["portrait","man","indoor","studio","neon","playful","soft-light","blue"],
  "IMG_1088.JPG": ["portrait","animal","indoor","neon","moody","intimate","playful","colorful"],
  "IMG_1090.JPG": ["portrait","studio","man","neon","moody","confident","blue","cinematic"],
  "IMG_1194.JPG": ["portrait","moody","woman","studio","fashion","indoor","dramatic","dark","elegant","glamour"],
  "IMG_1199.JPG": ["portrait","moody","woman","indoor","fashion","dramatic","dark","sensual","gothic"],
  "IMG_1204.JPG": ["portrait","moody","studio","fashion","woman","vintage","elegant","low-key","warm-tones"],
  "IMG_1234.JPG": ["abstract","neon","night","indoor","futuristic","colorful","vibrant"],
  "IMG_1238.JPG": ["abstract","neon","indoor","vibrant","colorful","futuristic"],
  "IMG_1346.JPG": ["sport","automotive","vintage","outdoor","action","speed","racing"],
  "IMG_1353.JPG": ["automotive","vintage","outdoor","sport","retro","street","urban"],
  "IMG_1384.JPG": ["nature","portrait","water","summer","woman","outdoor","tattoo","candid","relaxed","adventure"],
  "IMG_1415.JPG": ["concert","outdoor","group","night","moody","summer","vibrant","energetic","red"],
  "IMG_1504.JPG": ["beach","summer","portrait","woman","travel","candid","tattoo","fashion","outdoor","retro","warm-tones","relaxed"],
  "IMG_1512.JPG": ["summer","beach","portrait","outdoor","woman","tattoo","fashion","joyful","vibrant","carefree"],
  "IMG_1514.JPG": ["landscape","nature","outdoor","beach","moody","sky","melancholic","minimalist","dusk"],
  "OrangePeel008_Original.jpg": ["portrait","abstract","woman","neon","moody","soft-light","dreamy","pastel"],
  "OrangePeel009_Original.jpg": ["portrait","woman","abstract","fashion","studio","neon","mysterious","dramatic","blue"],
  "OrangePeel018_Original.jpg": ["portrait","fashion","indoor","group","night","neon","playful","vibrant","retro"],
  "OrangePeel023.jpg": ["portrait","fashion","group","indoor","vintage","woman","retro","bohemian","playful","vibrant"],
  "OrangePeel069_Original.jpg": ["portrait","abstract","woman","neon","vibrant","playful","sensual","creative"],
  "OrangePeel076_Original.jpg": ["portrait","abstract","woman","studio","neon","close-up","playful","vibrant","glamour"],
  "Petite LeMans-16.jpg": ["automotive","sport","outdoor","action","speed","racing","dynamic"],
  "Petite%20LeMans-41 Edited.jpg": ["automotive","sport","outdoor","action","golden-hour","cinematic","racing"],
  "RV_12.jpg": ["portrait","woman","studio","moody","dramatic","close-up","intense","dark"],
  "RV_15.jpg": ["animal","indoor","moody","tattoo","woman","intimate","warm-tones","vintage","candid"],
  "RV_35.jpg": ["portrait","woman","moody","studio","candid","dramatic","intimate","dark"],
  "RV_41.jpg": ["portrait","candid","woman","indoor","moody","abstract","warm-tones","intimate","retro"],
  "RV_48.jpg": ["portrait","moody","woman","studio","tattoo","dramatic","dark","red","confident"],
  "RV_54.jpg": ["portrait","moody","tattoo","abstract","woman","dark","intimate","blue","mysterious"],
  "RV_59.jpg": ["portrait","moody","woman","indoor","fashion","dark","intimate","sensual","night"],
  "RV_61.jpg": ["portrait","black-and-white","woman","moody","indoor","fashion","intimate","dark","mysterious"],
  "RV_79.jpg": ["black-and-white","portrait","group","candid","moody","intimate","close-up","emotional"],
  "Recipe-2(1).jpg": ["portrait","nature","landscape","travel","woman","outdoor","fashion","hiking","adventure","mountains"],
  "RedOctober040.jpg": ["portrait","tattoo","woman","abstract","studio","blue","sensual","soft-light"],
  "RedOctober050.jpg": ["portrait","indoor","fashion","woman","neon","intimate","sensual","romantic","vibrant"],
  "RedOctober052.jpg": ["portrait","woman","indoor","fashion","intimate","moody"],
  "SierraRed022.jpg": ["portrait","woman","abstract","tattoo","soft-light","pastel","dreamy"],
  "SierraRed025.jpg": ["portrait","studio","fashion","woman","indoor","moody","tattoo","bohemian","warm-tones","dramatic"],
  "SpaceParty038_Original.jpg": ["portrait","neon","abstract","moody","futuristic","dark","vibrant"],
  "SpaceParty045_Original.jpg": ["portrait","neon","fashion","abstract","party","vibrant","futuristic"],
  "SpaceParty059_Original.jpg": ["concert","neon","group","party","vibrant","energetic"],
  "SpaceParty064_Original.jpg": ["portrait","fashion","studio","woman","abstract","neon","futuristic","vibrant","glitch"],
  "Stairs Export-7(7).jpg": ["portrait","moody","woman","studio","tattoo","intimate","warm-tones","sensual"],
  "Winter Solstace 24-36.jpg": ["portrait","woman","moody","fashion","studio","dramatic","dark","elegant","intimate"],
  "Winter Solstace 24-50.jpg": ["portrait","moody","woman","tattoo","fashion","studio","dramatic","dark","intimate","gothic"],
  "X70_103.jpg": ["street","outdoor","candid","city","urban","daylight"],
  "X70_112.jpg": ["portrait","group","outdoor","candid","fashion","woman","tattoo","bohemian","retro","vintage","joyful"],
  "X70_114.jpg": ["street","outdoor","city","urban"],
  "X70_117.jpg": ["concert","night","group","indoor","moody","red","energetic","crowd"],
  "X70_71.jpg": ["automotive","landscape","outdoor","nature","travel","mountains","golden-hour","warm-tones","vintage"],
  "X70_73.jpg": ["travel","automotive","nature","outdoor","landscape","mountains","pov","adventure","green"],
  "X70_86.jpg": ["street","outdoor","city","urban"],
  "X70_95.jpg": ["city","street","group","outdoor","moody","golden-hour","silhouette","urban"],
  "X70_99.jpg": ["street","city","black-and-white","group","outdoor","urban","candid","action"],
  "montfordskatin-0020_Original.jpg": ["abstract","group","portrait","neon","vibrant","playful","creative"],
  "montfordskatin-0022_Original.jpg": ["sport","man","portrait","vintage","neon","action","vibrant","retro"],
  "montfordskatin-0025_Original.jpg": ["portrait","outdoor","sport","sky","abstract","neon","blue","retro","creative"],
  "montfordskatin-0026_Original.jpg": ["sport","studio","fashion","abstract","neon","action","vibrant","dynamic"],
  "x70_27.jpg": ["portrait","abstract","neon","vibrant","psychedelic","colorful"],
  "x70_3.jpg": ["portrait","indoor","candid","woman","fashion","joyful","warm-tones","playful"],
  "x70_38.jpg": ["outdoor","nature","travel","landscape","fog","moody","melancholic","minimalist"],
  "x70_42.jpg": ["nature","forest","outdoor","sky","minimalist","green","serene"],
  "x70_45.jpg": ["landscape","nature","outdoor","forest","moody","fog","path","serene","wilderness"],
  "x70_46.jpg": ["group","outdoor","candid","summer","woman","nature","friendship","green"],
  "x70_65.jpg": ["portrait","outdoor","travel","nature","woman","mountains","fog","moody","serene"],
  "x70_67.jpg": ["portrait","outdoor","candid","sky","man","street","blue","casual"],
};

// --- Build tag label lookup ---
// Start with the 65 formally defined tags
const tagLabelMap = new Map();
for (const def of LEGACY_DEFINITIONS) {
  tagLabelMap.set(def.id, def.label);
}

// Collect all unique tag IDs from mappings, auto-derive labels for orphans
for (const tagIds of Object.values(LEGACY_MAPPINGS)) {
  for (const tagId of tagIds) {
    if (!tagLabelMap.has(tagId)) {
      // Derive label: replace hyphens with spaces, title-case each word
      const label = tagId
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      tagLabelMap.set(tagId, label);
    }
  }
}

// --- Immich API helpers ---

async function apiFetch(path, options = {}) {
  const url = `${IMMICH_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': IMMICH_API_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Immich API ${res.status} ${res.statusText} for ${path}: ${body}`);
  }
  return res.json();
}

// --- Main migration ---

async function main() {
  console.log('=== Legacy AI Tag Migration to Immich ===\n');
  console.log(`Immich URL: ${IMMICH_URL}`);
  console.log(`Tag definitions: ${tagLabelMap.size} (${LEGACY_DEFINITIONS.length} defined + ${tagLabelMap.size - LEGACY_DEFINITIONS.length} orphan)`);
  console.log(`Image mappings: ${Object.keys(LEGACY_MAPPINGS).length}\n`);

  // 1. Find SomaticStudio album
  console.log('[1/5] Finding album...');
  const albums = await apiFetch('/albums');
  const album = albums.find(a => a.albumName === ALBUM_NAME);
  if (!album) {
    console.error(`ERROR: Album "${ALBUM_NAME}" not found in Immich.`);
    process.exit(1);
  }
  console.log(`  Found album "${ALBUM_NAME}" (${album.id})\n`);

  // 2. Load album assets and build filename → assetId map
  console.log('[2/5] Loading album assets...');
  const albumDetail = await apiFetch(`/albums/${album.id}`);
  const assets = (albumDetail.assets || []).filter(a => a.type === 'IMAGE');
  console.log(`  ${assets.length} image assets in album\n`);

  // Build case-insensitive filename → assetId map
  const filenameToAssetId = new Map();
  for (const asset of assets) {
    filenameToAssetId.set(asset.originalFileName.toLowerCase(), asset.id);
  }

  // 3. Match legacy filenames to asset IDs
  console.log('[3/5] Matching filenames to assets...');
  const matched = new Map(); // assetId → tagIds[]
  const unmatched = [];

  for (const [filename, tagIds] of Object.entries(LEGACY_MAPPINGS)) {
    // Decode URL-encoded filenames (e.g., "Petite%20LeMans-41 Edited.jpg")
    const decoded = decodeURIComponent(filename);
    const assetId = filenameToAssetId.get(decoded.toLowerCase());

    if (assetId) {
      matched.set(assetId, tagIds);
    } else {
      unmatched.push(decoded);
    }
  }

  console.log(`  Matched: ${matched.size}/${Object.keys(LEGACY_MAPPINGS).length}`);
  if (unmatched.length > 0) {
    console.log(`  Unmatched (${unmatched.length}):`);
    for (const f of unmatched) {
      console.log(`    - ${f}`);
    }
  }
  console.log();

  // 4. Create Immich tags (SomaticStudio/{Label})
  console.log('[4/5] Creating Immich tags...');

  // Collect all tag IDs actually used in matched mappings
  const usedTagIds = new Set();
  for (const tagIds of matched.values()) {
    for (const id of tagIds) usedTagIds.add(id);
  }

  // Fetch existing tags to avoid duplicates
  // Immich returns { name: "Portrait", value: "SomaticStudio/Portrait" }
  // We need to match on `value` (the full path) since that's what we create
  const existingTags = await apiFetch('/tags');
  const existingByName = new Map();
  for (const t of existingTags) {
    // Index by both value (full path) and name (leaf) for robust matching
    if (t.value) existingByName.set(t.value, t.id);
    if (t.name) existingByName.set(t.name, t.id);
  }

  // Map: legacyTagId → immichTagId
  const tagIdToImmichId = new Map();
  let created = 0;
  let alreadyExisted = 0;

  for (const tagId of usedTagIds) {
    const label = tagLabelMap.get(tagId);
    const immichName = `${TAG_PREFIX}${label}`;
    const existingId = existingByName.get(immichName);

    if (existingId) {
      tagIdToImmichId.set(tagId, existingId);
      alreadyExisted++;
    } else {
      try {
        const result = await apiFetch('/tags', {
          method: 'POST',
          body: JSON.stringify({ name: immichName }),
        });
        tagIdToImmichId.set(tagId, result.id);
        created++;
      } catch (e) {
        console.error(`  Failed to create tag "${immichName}": ${e.message}`);
      }
    }
  }

  console.log(`  ${created} tags created, ${alreadyExisted} already existed, ${usedTagIds.size} total\n`);

  // 5. Assign tags to assets
  console.log('[5/5] Assigning tags to assets...');

  // Build reverse map: immichTagId → assetIds[]
  const tagToAssets = new Map();
  for (const [assetId, tagIds] of matched) {
    for (const tagId of tagIds) {
      const immichTagId = tagIdToImmichId.get(tagId);
      if (immichTagId) {
        if (!tagToAssets.has(immichTagId)) tagToAssets.set(immichTagId, []);
        tagToAssets.get(immichTagId).push(assetId);
      }
    }
  }

  let totalAssigned = 0;
  let totalDuplicate = 0;
  let totalFailures = 0;

  for (const [immichTagId, assetIds] of tagToAssets) {
    try {
      const results = await apiFetch(`/tags/${immichTagId}/assets`, {
        method: 'PUT',
        body: JSON.stringify({ ids: assetIds }),
      });

      for (const r of results) {
        if (r.success) {
          totalAssigned++;
        } else if (r.error === 'duplicate') {
          totalDuplicate++;
        } else {
          totalFailures++;
          console.warn(`  Assignment failed: tag=${immichTagId} asset=${r.id} error=${r.error}`);
        }
      }
    } catch (e) {
      console.error(`  Failed to assign tag ${immichTagId}: ${e.message}`);
      totalFailures += assetIds.length;
    }
  }

  // --- Summary ---
  console.log('\n=== Migration Complete ===');
  console.log(`Tags:        ${created} created, ${alreadyExisted} already existed`);
  console.log(`Assets:      ${matched.size} matched, ${unmatched.length} unmatched`);
  console.log(`Assignments: ${totalAssigned} new, ${totalDuplicate} duplicate (skipped), ${totalFailures} failed`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
