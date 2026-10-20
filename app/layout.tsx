import './globals.css';
import './polish.css';
import './cloud.css';
import './landing.css';
import './landing-shine.css';
import './study-canvas.css';
import './workspace-shine.css';
import './typing-focus.css';
export const metadata = { title: 'DopeWrite — Make knowledge stick', description: 'Turn your documents into typing practice and active recall.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
