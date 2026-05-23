# AtlasDash

A Phaser 3 game built with plain ES modules (no bundler).

## Gameplay

Press Space, the Up arrow, or tap/click to jump. You dash forward automatically;
clear each level by reaching the end while jumping the red obstacles. There are
three levels of increasing difficulty (faster pace, denser and taller
obstacles). Hit an obstacle and you retry the current level.

## How to run locally

ES modules must be served over HTTP, so opening `index.html` directly via
`file://` will not work. From the project root, run a static server:

    npx http-server -p 8080

Then open http://localhost:8080 in your browser.
