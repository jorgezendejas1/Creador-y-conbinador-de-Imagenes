/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Modality, Part} from '@google/genai';

// Fix: Define and use AIStudio interface for window.aistudio to resolve type conflict.
// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

interface ImageData {
  base64: string;
  mimeType: string;
}

async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    // This provides a fallback for environments where the dialog isn't available
    showStatusError(
      'La selección de clave de API no está disponible. Por favor, configura la variable de entorno API_KEY.',
    );
  }
}

const statusEl = document.querySelector('#status') as HTMLDivElement;

async function generateImage(prompt: string, apiKey: string) {
  const ai = new GoogleGenAI({apiKey});

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
  });

  const images = response.generatedImages;
  if (images === undefined || images.length === 0) {
    throw new Error(
      'No se generaron imágenes. El prompt puede haber sido bloqueado.',
    );
  }

  const base64ImageBytes = images[0].image.imageBytes;
  const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
  outputImage.src = imageUrl;
  outputImage.style.display = 'block';
  downloadButton.style.display = 'block';
}

async function combineImages(
  prompt: string,
  imageList: ImageData[],
  apiKey: string,
) {
  const ai = new GoogleGenAI({apiKey});

  const imageParts: Part[] = imageList.map((image) => ({
    inlineData: {
      mimeType: image.mimeType,
      data: image.base64,
    },
  }));
  const textPart: Part = {text: prompt};

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image-preview',
    contents: {
      parts: [...imageParts, textPart],
    },
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  let generatedImageFound = false;
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64ImageBytes: string = part.inlineData.data;
      const imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
      outputImage.src = imageUrl;
      outputImage.style.display = 'block';
      downloadButton.style.display = 'block';
      generatedImageFound = true;
      break;
    }
  }

  if (!generatedImageFound) {
    throw new Error(
      'No se pudo generar una imagen combinada. Intenta con un prompt diferente.',
    );
  }
}

// --- DOM Element Selection ---
const promptGenerateEl = document.querySelector(
  '#prompt-input-generate',
) as HTMLTextAreaElement;
const promptCombineEl = document.querySelector(
  '#prompt-input-combine',
) as HTMLTextAreaElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const outputImage = document.querySelector('#output-image') as HTMLImageElement;
const downloadButton = document.querySelector(
  '#download-button',
) as HTMLButtonElement;
const tabGenerate = document.querySelector('#tab-generate') as HTMLButtonElement;
const tabCombine = document.querySelector('#tab-combine') as HTMLButtonElement;
const panelGenerate = document.querySelector(
  '#panel-generate',
) as HTMLDivElement;
const panelCombine = document.querySelector('#panel-combine') as HTMLDivElement;
const imageUploadsContainer = document.querySelector(
  '#image-uploads-container',
) as HTMLDivElement;
const addImageButton = document.querySelector(
  '#add-image-button',
) as HTMLButtonElement;

// --- State Variables ---
let activeTab: 'generate' | 'combine' = 'generate';
const images: (ImageData | null)[] = [];

// --- Helper Functions ---
function fileToBase64(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({base64, mimeType: file.type});
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupUploadArea(area: HTMLDivElement, index: number) {
  const input = area.querySelector('input[type="file"]') as HTMLInputElement;
  const placeholder = area.querySelector('.placeholder') as HTMLDivElement;
  const preview = area.querySelector('.preview') as HTMLImageElement;

  const onImageLoaded = (imageData: ImageData) => {
    images[index] = imageData;
  };

  area.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const imageData = await fileToBase64(file);
      onImageLoaded(imageData);
      preview.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
      placeholder.style.display = 'none';
      preview.style.display = 'block';
    }
  });

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('dragover');
  });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', async (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      input.files = e.dataTransfer.files;
      const imageData = await fileToBase64(file);
      onImageLoaded(imageData);
      preview.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
      placeholder.style.display = 'none';
      preview.style.display = 'block';
    }
  });
}

// --- Event Listeners & Initial Setup ---
tabGenerate.addEventListener('click', () => switchTab('generate'));
tabCombine.addEventListener('click', () => switchTab('combine'));
generateButton.addEventListener('click', () => performGeneration());
downloadButton.addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = outputImage.src;
  link.download = 'imagen-generada.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

document.querySelectorAll('.image-upload-area').forEach((area, index) => {
  images.push(null); // Initialize state for existing areas
  setupUploadArea(area as HTMLDivElement, index);
});

addImageButton.addEventListener('click', () => {
  const newIndex = images.length;
  const newUploadArea = document.createElement('div');
  newUploadArea.className = 'image-upload-area';
  newUploadArea.innerHTML = `
      <input type="file" accept="image/*" class="hidden" />
      <div class="placeholder">
        <svg class="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        <p>Subir Imagen ${newIndex + 1}</p>
      </div>
      <img src="" alt="Previsualización ${
        newIndex + 1
      }" class="preview hidden w-full h-full object-cover rounded-lg" />
  `;
  imageUploadsContainer.appendChild(newUploadArea);
  images.push(null); // Add placeholder in state array
  setupUploadArea(newUploadArea, newIndex);
});

// --- Functions ---
function switchTab(tab: 'generate' | 'combine') {
  activeTab = tab;
  if (tab === 'generate') {
    tabGenerate.className =
      'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-blue-400 border-blue-400';
    tabCombine.className =
      'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-500';
    panelGenerate.style.display = 'block';
    panelCombine.style.display = 'none';
    generateButton.textContent = 'Generar';
  } else {
    tabCombine.className =
      'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-blue-400 border-blue-400';
    tabGenerate.className =
      'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-500';
    panelGenerate.style.display = 'none';
    panelCombine.style.display = 'block';
    generateButton.textContent = 'Combinar';
  }
}

function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  promptGenerateEl.disabled = disabled;
  promptCombineEl.disabled = disabled;
  addImageButton.disabled = disabled;
  document.querySelectorAll('.image-upload-area').forEach((area) => {
    (area as HTMLDivElement).style.pointerEvents = disabled ? 'none' : 'auto';
  });
}

async function performGeneration() {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    showStatusError(
      'Clave de API no configurada. Por favor, añade tu clave de API.',
    );
    await openApiKeyDialog();
    return;
  }

  let prompt = '';
  if (activeTab === 'generate') {
    prompt = promptGenerateEl.value.trim();
    if (!prompt) {
      showStatusError('Por favor, introduce un prompt para generar una imagen.');
      return;
    }
    statusEl.innerText = 'Generando imagen...';
  } else {
    prompt = promptCombineEl.value.trim();
    const validImages = images.filter((img) => img !== null) as ImageData[];
    if (validImages.length < 2) {
      showStatusError('Por favor, sube al menos dos imágenes para combinar.');
      return;
    }
    if (!prompt) {
      showStatusError('Por favor, describe cómo combinar las imágenes.');
      return;
    }
    statusEl.innerText = 'Combinando imágenes...';
  }

  outputImage.style.display = 'none';
  downloadButton.style.display = 'none';
  setControlsDisabled(true);

  try {
    if (activeTab === 'generate') {
      await generateImage(prompt, apiKey);
    } else {
      const validImages = images.filter((img) => img !== null) as ImageData[];
      await combineImages(prompt, validImages, apiKey);
    }
    statusEl.innerText = 'Imagen generada con éxito.';
  } catch (e) {
    console.error('La generación de imagen falló:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'Ocurrió un error desconocido.';

    let userFriendlyMessage = `Error: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          'Modelo no encontrado. Esto puede ser causado por una clave de API inválida o problemas de permisos. Por favor, verifica tu clave de API.';
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage =
          'Tu clave de API es inválida. Por favor, añade una clave de API válida.';
        shouldOpenDialog = true;
      }
    }

    showStatusError(userFriendlyMessage);

    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    setControlsDisabled(false);
  }
}