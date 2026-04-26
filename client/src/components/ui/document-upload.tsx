import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, FileImage, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DocumentUploadProps {
  label: string;
  documentType: 'photo' | 'aadhar' | 'pan';
  currentUrl?: string;
  onFileSelect: (base64Data: string) => void;
  onRemove: () => void;
  maxSizeMB?: number;
  disabled?: boolean;
  required?: boolean;
}

export function DocumentUpload({
  label,
  documentType,
  currentUrl,
  onFileSelect,
  onRemove,
  maxSizeMB = 5,
  disabled = false,
  required = false
}: DocumentUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image file (JPEG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      toast({
        title: "File Too Large",
        description: `File size must be less than ${maxSizeMB}MB. Selected file is ${fileSizeMB.toFixed(2)}MB`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target?.result as string;
        setPreview(base64Data);
        onFileSelect(base64Data);
        setIsLoading(false);
      };
      reader.onerror = () => {
        toast({
          title: "File Read Error",
          description: "Failed to read the file. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast({
        title: "Upload Error",
        description: "An error occurred while processing the file.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onRemove();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleViewDocument = () => {
    if (preview) {
      window.open(preview, '_blank');
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="flex items-start gap-3">
        {/* Preview or Upload Button */}
        {preview ? (
          <div className="relative group">
            <div className="w-24 h-24 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-800">
              <img
                src={preview}
                alt={label}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-white hover:text-white"
                  onClick={handleViewDocument}
                  data-testid={`button-view-${documentType}`}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
            <FileImage className="h-8 w-8 text-gray-400" />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled || isLoading}
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading}
            data-testid={`button-upload-${documentType}`}
          >
            <Upload className="h-4 w-4 mr-2" />
            {preview ? 'Change' : 'Upload'}
          </Button>

          {preview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              data-testid={`button-remove-${documentType}`}
            >
              <X className="h-4 w-4 mr-2" />
              Remove
            </Button>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Max {maxSizeMB}MB
            {documentType === 'photo' && <br />}
            {documentType === 'photo' && '(Recommended: Square image)'}
          </p>
        </div>
      </div>
    </div>
  );
}
