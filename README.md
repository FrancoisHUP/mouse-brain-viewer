# Mouse Brain Viewer

A web-based 3D viewer for exploring mouse brain data in the browser.

This project is designed to visualize volumetric brain data, meshes, slices, and annotations in an interactive scene. It is built with React, TypeScript, Vite, and WebGL, with a strong focus on loading scientific imaging data directly in the browser and giving users practical tools to inspect and manipulate layers.

## What this project does

The viewer lets users:

- load and visualize 3D brain volumes
- display canonical slice views and custom slices
- render meshes in the same 3D scene
- add and edit annotations
- manage data through a layer panel with grouping, visibility, and ordering
- save, restore, and share viewer state
- work with both remote datasets and browser-local datasets

The goal is to provide a practical interface for exploring mouse brain imaging data in a way that is visual, interactive, and accessible from the web.

## Main features

- **3D WebGL viewer**
  - interactive camera controls
  - fly and orbit navigation
  - scene selection tools

- **Layer system**
  - hierarchical groups
  - drag and drop reordering
  - multi-selection support
  - visibility toggles

- **Data support**
  - remote OME-Zarr volumes
  - local browser-hosted volume data
  - mesh layers
  - custom slice layers

- **Annotation tools**
  - points
  - lines
  - rectangles
  - circles
  - freehand drawing
  - eraser

- **State and sharing**
  - viewer history
  - saved viewer library
  - import/export of viewer state
  - shareable viewer links for serializable scenes

## Tech stack

- React
- TypeScript
- Vite
- WebGL
- gl-matrix

## Local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Notes

Some datasets can be loaded from remote sources, while others are stored only in the browser and are not shareable across devices.

The project includes tools for scientific data exploration, so some features are designed around slice navigation, orientation handling, and local dataset management.

## Status

This project is under active development, and the viewer continues to evolve with new interaction tools, UI improvements, and data handling features.

## License

This project is licensed under the MIT License.

Note: external datasets, scientific assets, and other third-party resources used with this viewer may be subject to their own separate licenses and terms of use.
