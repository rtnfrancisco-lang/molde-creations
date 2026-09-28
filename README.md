# MoldeCore: Pattern Magic

Create a clean and modern web application dashboard called "MoldeCore", which is a clothing pattern automation system tailored for sublimation printing. 

In this first version, build the main layout consisting of:

1. A sidebar to manage patterns. At the very top, feature the brand name "MoldeCore" prominently with a sleek modern icon next to it. Below the branding, include a selector to choose the "Clothing Type" (e.g., T-Shirt, Hoodie, Tank Top) and a button to "Create New Pattern".

2. A main central area that will serve as our workspace.

3. A right-hand settings panel titled "Base Pattern Dimensions (Size M)". Inside this panel, include input fields for core measurements:

   - Total Height (cm)

   - Chest/Width (cm)

   - Sleeve Length (cm)

   - Shoulder Width (cm)

Include a "Generate Base Blueprint" button at the bottom of the right panel. For now, when this button is clicked, save these measurements in a reactive state so we can use them to draw on the canvas later. Use Tailwind CSS for a professional look and Lucide React icons for the interface elements.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://molde-creations.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1b8f4ba5-7038-4715-9ec2-aee74cc1327b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
