import { renderToString } from 'react-dom/server';
import React from 'react';
import Image from 'next/image';

const el = React.createElement(Image, {
  src: 'https://d294cbym1d7nev.cloudfront.net/products/other-sports-equipment/musical-instruments/steel-tongue-drum/cjst2817054.png',
  fill: true,
  sizes: '(max-width: 768px) 200px, 300px',
  alt: 'Test',
  unoptimized: true
});

console.log(renderToString(el));
