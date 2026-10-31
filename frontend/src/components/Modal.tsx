import React from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  onClose,
  maxWidth = '680px',
  children,
}) => {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};
