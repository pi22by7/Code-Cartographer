// Node.js compatible version of the Code Cartographer Logo Generator
const fs = require('fs');

function generateCodeCartographerLogo(size = 512, seed = 42) {
    // Initialize random number generator with seed for reproducibility
    let randomSeed = seed;
    const random = () => {
        randomSeed = (randomSeed * 9301 + 49297) % 233280;
        return randomSeed / 233280;
    };

    // SVG content as a string
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="#1e1e1e"/>
  
  <!-- Topographic Map Layers -->
  <g>`;

    // Generate a topographic map using layered contour lines
    const layers = 8;
    const points = 12;
    const centerX = size / 2;
    const centerY = size / 2;

    // Generate colors for each layer
    const colors = [
        "#264F73", // Deep blue
        "#2D5F8B", // Medium blue
        "#356FA3", // Light blue
        "#4580B5", // Sky blue
        "#569FD3", // Highlight blue
        "#648FAF", // Transition color
        "#A9CDEC", // Light accent
        "#D6E5F3"  // Very light accent
    ];

    // Generate base points for the map
    const basePoints = [];
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const distance = (size * 0.35) + (random() * size * 0.1);
        basePoints.push({
            x: centerX + Math.cos(angle) * distance,
            y: centerY + Math.sin(angle) * distance
        });
    }

    // Create contour layers from outside in
    for (let layer = 0; layer < layers; layer++) {
        const layerPoints = basePoints.map(point => {
            // Scale points inward for each layer
            const scaleRatio = 1 - (layer * 0.12);
            return {
                x: centerX + (point.x - centerX) * scaleRatio,
                y: centerY + (point.y - centerY) * scaleRatio
            };
        });

        // Create a path for this contour
        let pathData = `M ${layerPoints[0].x} ${layerPoints[0].y}`;

        // Add each point to the path
        for (let i = 1; i < layerPoints.length; i++) {
            // Create a slightly curved line between points
            const prevPoint = layerPoints[i - 1];
            const currentPoint = layerPoints[i];
            const controlX = prevPoint.x + (currentPoint.x - prevPoint.x) * 0.5 + (random() - 0.5) * 30;
            const controlY = prevPoint.y + (currentPoint.y - prevPoint.y) * 0.5 + (random() - 0.5) * 30;

            pathData += ` Q ${controlX} ${controlY}, ${currentPoint.x} ${currentPoint.y}`;
        }

        // Close the path back to the first point
        const lastPoint = layerPoints[layerPoints.length - 1];
        const firstPoint = layerPoints[0];
        const controlX = lastPoint.x + (firstPoint.x - lastPoint.x) * 0.5 + (random() - 0.5) * 30;
        const controlY = lastPoint.y + (firstPoint.y - lastPoint.y) * 0.5 + (random() - 0.5) * 30;
        pathData += ` Q ${controlX} ${controlY}, ${firstPoint.x} ${firstPoint.y}`;
        pathData += " Z";

        svg += `
    <path d="${pathData}" fill="${colors[layer]}" stroke="#ffffff22" stroke-width="1"/>`;
    }

    svg += `
  </g>
  
  <!-- Grid lines -->
  <g>`;

    // Add grid lines
    const gridSize = size / 10;

    // Horizontal grid lines
    for (let y = 0; y <= size; y += gridSize) {
        svg += `
    <line x1="0" y1="${y}" x2="${size}" y2="${y}" stroke="#ffffff15" stroke-width="1"/>`;
    }

    // Vertical grid lines
    for (let x = 0; x <= size; x += gridSize) {
        svg += `
    <line x1="${x}" y1="0" x2="${x}" y2="${size}" stroke="#ffffff15" stroke-width="1"/>`;
    }

    svg += `
  </g>
  
  <!-- Compass Rose -->
  <g>`;

    // Add compass rose
    const directions = ["N", "E", "S", "W"];
    for (let i = 0; i < directions.length; i++) {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const distance = size * 0.35;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        svg += `
    <line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="#ffffff70" stroke-width="2"/>
    <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="monospace" font-weight="bold" font-size="24px">${directions[i]}</text>`;
    }

    svg += `
  </g>
  
  
  <!-- Center Point -->
  <circle cx="${centerX}" cy="${centerY}" r="8" fill="#ffffff"/>
  
  <!-- Title Text -->
  <!-- <text x="${centerX}" y="${size - 256}" text-anchor="middle" fill="#000000" font-family="monospace" font-weight="bold" font-size="24px">CODE CARTOGRAPHER</text> -->
</svg>`;

    return svg;
}

// Generate and save the logo
function saveLogo(outputPath = 'code-cartographer-logo.svg', size = 512, seed = 42) {
    const svgContent = generateCodeCartographerLogo(size, seed);
    fs.writeFileSync(outputPath, svgContent);
    console.log(`Logo saved to ${outputPath}`);
    return svgContent;
}

// If running directly (not imported)
if (require.main === module) {
    // Generate with random seed
    const seed = Math.floor(Math.random() * 10000);
    saveLogo('code-cartographer-logo.svg', 512, seed);
}

module.exports = {
    generateCodeCartographerLogo,
    saveLogo
};