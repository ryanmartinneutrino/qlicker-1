import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

function clampWidth(width) {
  const value = Number(width);
  if (!Number.isFinite(value)) return 320;
  return Math.max(120, Math.min(900, Math.round(value)));
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => {
          const raw = element.getAttribute('data-width') || element.getAttribute('width');
          if (!raw) return null;
          const parsed = Number.parseInt(raw, 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: attributes => {
          if (!attributes.width) return {};
          const width = clampWidth(attributes.width);
          return {
            width,
            'data-width': width,
          };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;
      const wrapper = document.createElement('span');
      wrapper.className = 'tiptap-resizable-image';
      wrapper.contentEditable = 'false';
      wrapper.style.display = 'inline-block';
      wrapper.style.position = 'relative';
      wrapper.style.maxWidth = '100%';
      wrapper.style.lineHeight = '0';
      wrapper.style.overflow = 'hidden';
      wrapper.style.resize = 'both';

      const image = document.createElement('img');
      image.draggable = false;
      image.src = currentNode.attrs.src || '';
      image.alt = currentNode.attrs.alt || '';
      image.title = currentNode.attrs.title || '';
      image.style.display = 'block';
      image.style.width = '100%';
      image.style.height = 'auto';
      image.style.maxWidth = 'none';
      image.style.pointerEvents = 'none';

      const applyWidth = (width) => {
        wrapper.style.width = `${clampWidth(width)}px`;
      };

      const persistWidth = () => {
        const pos = getPos?.();
        if (typeof pos !== 'number') return;
        const width = clampWidth(wrapper.getBoundingClientRect().width);
        editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, width });
          return true;
        }).run();
      };

      applyWidth(currentNode.attrs.width || 320);

      const onImageLoad = () => {
        if (currentNode.attrs.width) return;
        applyWidth(image.naturalWidth || 320);
        persistWidth();
      };
      image.addEventListener('load', onImageLoad);

      const onResizeStop = () => {
        persistWidth();
      };
      wrapper.addEventListener('mouseup', onResizeStop);
      wrapper.addEventListener('touchend', onResizeStop);

      wrapper.appendChild(image);

      return {
        dom: wrapper,
        update(updatedNode) {
          if (updatedNode.type !== currentNode.type) return false;
          currentNode = updatedNode;
          if (image.src !== (updatedNode.attrs.src || '')) {
            image.src = updatedNode.attrs.src || '';
          }
          image.alt = updatedNode.attrs.alt || '';
          image.title = updatedNode.attrs.title || '';
          applyWidth(updatedNode.attrs.width || 320);
          return true;
        },
        destroy() {
          image.removeEventListener('load', onImageLoad);
          wrapper.removeEventListener('mouseup', onResizeStop);
          wrapper.removeEventListener('touchend', onResizeStop);
        },
      };
    };
  },
});

export default ResizableImage;
