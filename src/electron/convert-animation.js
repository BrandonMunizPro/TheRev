/**
 * VRMA Animation Converter
 *
 * Converts Mixamo FBX animations to VRMA format for use with three-vrm-animation
 *
 * Usage:
 *   node convert-animation.js <input.fbx> <output.vrma>
 *
 * Example:
 *   node convert-animation.js "C:\Downloads\happy.fbx" "src\electron\frontend\animations\Happy.vrma"
 */

const fs = require('fs');
const path = require('path');

// Path to the fbx2vrma converter
const CONVERTER_PATH = path.join(
  __dirname,
  'animations-converter',
  'fbx2vrma-converter.js'
);

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('');
  console.log(
    '╔═══════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║           Mixamo FBX to VRMA Animation Converter                    ║'
  );
  console.log(
    '╠═══════════════════════════════════════════════════════════════════════╣'
  );
  console.log(
    '║                                                                    ║'
  );
  console.log(
    '║  Usage: node convert-animation.js <input.fbx> [output.vrma]       ║'
  );
  console.log(
    '║                                                                    ║'
  );
  console.log(
    '║  Examples:                                                         ║'
  );
  console.log(
    '║    node convert-animation.js "downloads/happy.fbx"                 ║'
  );
  console.log(
    '║    node convert-animation.js "downloads/happy.fbx" "animations/Happy.vrma"'
  );
  console.log(
    '║                                                                    ║'
  );
  console.log(
    '║  Workflow:                                                         ║'
  );
  console.log(
    '║    1. Download animation from Mixamo (select FBX, no skin)        ║'
  );
  console.log(
    '║    2. Run this converter: FBX → VRMA                             ║'
  );
  console.log(
    '║    3. Place .vrma file in src/electron/frontend/animations/      ║'
  );
  console.log(
    '║    4. Restart app - animation auto-loads                          ║'
  );
  console.log(
    '║                                                                    ║'
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════════════╝'
  );
  console.log('');
  console.log('Mixamo Download Tips:');
  console.log('  - Go to mixamo.com');
  console.log('  - Find an animation (Emotions, Body Language, etc.)');
  console.log('  - Click Download → Select FBX format');
  console.log('  - Choose "Without Skin" (we only need the animation)');
  console.log('  - Choose 30 FPS for smoother animation');
  console.log('');
  process.exit(1);
}

const inputPath = args[0];
let outputPath = args[1];

// If no output specified, create one based on input
if (!outputPath) {
  const parsed = path.parse(inputPath);
  outputPath = path.join(
    __dirname,
    'frontend',
    'animations',
    `${parsed.name}.vrma`
  );
}

// Ensure output directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Converting: ${inputPath}`);
console.log(`Output: ${outputPath}`);
console.log('');

// Run the converter
const { spawn } = require('child_process');
const FBX2GLTF_PATH = path.join(
  __dirname,
  'animations-converter',
  'FBX2glTF-windows-x64.exe'
);
const converter = spawn(
  'node',
  [
    CONVERTER_PATH,
    '-i',
    inputPath,
    '-o',
    outputPath,
    '--framerate',
    '30',
    '--fbx2gltf',
    FBX2GLTF_PATH,
  ],
  { stdio: 'inherit' }
);

converter.on('close', (code) => {
  if (code === 0) {
    console.log('');
    console.log('✅ Conversion complete!');
    console.log('');
    console.log('Next steps:');
    console.log(
      `  1. Move ${path.basename(outputPath)} to src/electron/frontend/animations/`
    );
    console.log('  2. Restart the app');
    console.log('  3. Animation will appear in the animation panel');
  } else {
    console.log('');
    console.log('❌ Conversion failed with code:', code);
    process.exit(1);
  }
});

converter.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
