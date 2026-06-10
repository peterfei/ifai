import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { SUPPORTED_ENCODINGS } from '../../utils/encoding';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

interface EncodingPickerProps {
  fileId: string;
  currentEncoding: string;
}

interface DropdownPos {
  right: number;
  bottom: number;
}

export const EncodingPicker: React.FC<EncodingPickerProps> = ({ fileId, currentEncoding }) => {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const changeFileEncoding = useFileStore(s => s.changeFileEncoding);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // 打开时同步计算 fixed 定位（无视父级 overflow-hidden）
  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      setDropdownPos(null);
    } else {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
          right: window.innerWidth - rect.right,
          bottom: window.innerHeight - rect.top + 4,
        });
      }
      setOpen(true);
    }
  }, [open]);

  const handleSelect = async (encoding: string) => {
    if (encoding === currentEncoding) {
      setOpen(false);
      setDropdownPos(null);
      return;
    }
    setOpen(false);
    setDropdownPos(null);
    try {
      await changeFileEncoding(fileId, encoding);
      toast.success(`Encoding: ${encoding}`);
    } catch (e) {
      console.error('[EncodingPicker] Failed:', e);
      toast.error(`Failed to switch to ${encoding}`);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        className="cursor-pointer hover:text-blue-400 transition-colors"
        onClick={handleToggle}
        data-testid="encoding-picker-trigger"
      >
        {currentEncoding}
      </button>
      {open && dropdownPos && (
        <div
          style={{
            position: 'fixed',
            right: dropdownPos.right,
            bottom: dropdownPos.bottom,
            zIndex: 99999,
          }}
          className="min-w-[180px] rounded border border-gray-600 bg-[#252526] shadow-xl"
          data-testid="encoding-picker-dropdown"
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-600">
            Select Encoding
          </div>
          {SUPPORTED_ENCODINGS.map(({ encoding, label }) => (
            <button
              key={encoding}
              className={`flex w-full items-center px-3 py-1.5 text-[12px] text-left hover:bg-[#2a2d2e] transition-colors ${
                encoding === currentEncoding ? 'text-blue-400' : 'text-gray-300'
              }`}
              onClick={() => handleSelect(encoding)}
              data-testid={`encoding-option-${encoding}`}
            >
              <span className="flex-1">{label}</span>
              {encoding === currentEncoding && (
                <Check size={14} className="text-blue-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
