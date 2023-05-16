import { useEffect, useRef } from 'react';
import './index.css';

const applyFilterImage = (imageData) => {
	const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  // Iterate pixel rows and columns to change red color of each.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let index = (x + (y * w)) * 4;
      data[index] = data[index] * 0.2;
    }
  } 
  return imageData;
};

function App() {
	const workerRef = useRef(null);
	const preview = useRef();

	useEffect(() => {
		const worker = new Worker(new URL('./worker.js', import.meta.url));
		worker.postMessage({
			type: 'registerTask',
			taskName: 'filter-image',
			fn: applyFilterImage.toString(),
		});
		worker.addEventListener('message', (event) => {
			const { taskName, result } = event.data;
			const previewCtx = getPreviewCtx();
      console.log(result);
			if (previewCtx) previewCtx.putImageData(result, 0, 0);
		});
		workerRef.current = worker;
	}, []);

	/** Sends image data to Worker to apply a filter. */
	const applyFilter = () => {
		const previewCtx = getPreviewCtx();
		const imageData = previewCtx.getImageData(
			0,
			0,
			preview.current.width,
			preview.current.height
		);
    console.log(imageData);
		if (workerRef.current) {
			workerRef.current.postMessage(
				{
					type: 'executeTask',
					taskName: 'filter-image',
					args: [imageData],
				},
				[imageData.data.buffer]
			);
		}
	};

  /**
	 * get canvas 2d context
	 */
	const getPreviewCtx = () => {
		if (!preview.current) return undefined;
		return preview.current.getContext('2d');
	};

	/**
	 * Processes image when added to input file. Including:
	 *   1. Resizing and drawing image in cavas.
	 *   2. Applying a filter (using a web worker).
	 * @param {!Event} e On change event on the input file.
	 */
	const handleUploadImage = (e) => {
		const file = e.target.files[0];
		/**
		 * Creates an ImageBitmap from loaded map.
		 * Once loaded: the image bitmap is added to canvas and a filter is applied.
		 * @param {!ImageBitmap} bitmap of the image loaded on the input field.
		 */
		createImageBitmap(file).then((bitmap) => {
			preview.current.height = bitmap.height;
			preview.current.width = bitmap.width;
      console.log(preview.current);
			const previewCtx = getPreviewCtx();
			previewCtx.drawImage(bitmap, 0, 0);
			applyFilter();
		});
	};

	return (
		<div className='App'>
			<input
				type='file'
				onChange={handleUploadImage}
				accept='image/*'
				name='input'
				id='input'
			/>
			<label htmlFor='input'>Choose File</label>
			<canvas ref={preview} id='preview'></canvas>
		</div>
	);
}

export default App;
