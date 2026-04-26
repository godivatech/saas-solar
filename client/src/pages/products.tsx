import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { sanitizeFormData } from "../../../shared/utils/form-sanitizer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Battery,
  Plug,
  Activity,
  Search,
  PlusCircle,
  Pencil,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown
} from "lucide-react";

// Types for pagination and products
interface PaginationInfo {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface ProductsResponse {
  data: any[];
  pagination: PaginationInfo;
}

interface Product {
  id: string;
  name: string;
  type?: string;
  make?: string;
  voltage?: string;
  rating?: string;
  unit?: string;
  price: number;
  quantity: number;
}

// Observer for virtualized rows
interface IntersectionObserverEntry {
  isIntersecting: boolean;
  target: Element;
}

export default function Products() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);

    return () => clearTimeout(timerId);
  }, [searchQuery]);

  // Fetch products with pagination
  const {
    data: productsResponse,
    isLoading,
    isFetching,
    isError
  } = useQuery({
    queryKey: [`/api/products?page=${currentPage}&limit=${itemsPerPage}&search=${debouncedSearch}&sortBy=${sortBy}&sortOrder=${sortOrder}`]
  });

  const products = (productsResponse as any)?.data || [];
  const pagination = (productsResponse as any)?.pagination;

  // Prefetch next page for smoother pagination
  useEffect(() => {
    if (pagination?.hasNextPage) {
      queryClient.prefetchQuery({
        queryKey: [`/api/products?page=${currentPage + 1}&limit=${itemsPerPage}&search=${debouncedSearch}&sortBy=${sortBy}&sortOrder=${sortOrder}`]
      });
    }
  }, [queryClient, currentPage, itemsPerPage, debouncedSearch, pagination?.hasNextPage, sortBy, sortOrder]);

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiRequest(`/api/products/${productId}`, "DELETE");
      if (!response.ok) {
        throw new Error("Failed to delete product");
      }
      return productId;
    },
    onSuccess: () => {
      // Invalidate all product queries to refresh the UI immediately
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/products') || queryKey.includes('/api/activity-logs');
          }
          return false;
        }
      });

      toast({
        title: "Product deleted",
        description: "The product has been deleted successfully",
      });
      setShowDeleteDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete product",
        variant: "destructive",
      });
    },
  });

  // Handle product deletion
  const handleDeleteProduct = (product: Product) => {
    setSelectedProduct(product);
    setShowDeleteDialog(true);
  };

  // Function to render product icon
  const renderProductIcon = (product: Product) => {
    const type = product.type?.toLowerCase() || '';

    if (type.includes('battery') || type.includes('power')) {
      return <Battery className="h-5 w-5 text-gray-500" />;
    } else if (type.includes('inverter') || type.includes('plug')) {
      return <Plug className="h-5 w-5 text-gray-500" />;
    } else {
      return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  // Function to determine stock status
  const getStockStatus = (quantity: number) => {
    if (quantity <= 5) {
      return { label: "Critical", style: "bg-red-100 text-red-800" };
    } else if (quantity <= 10) {
      return { label: "Low", style: "bg-yellow-100 text-yellow-800" };
    } else {
      return { label: "In Stock", style: "bg-green-100 text-green-800" };
    }
  };

  // Function to handle sort changes
  const handleSort = (field: string) => {
    if (sortBy === field) {
      // Toggle order if clicking the same field
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // New field, default to ascending
      setSortBy(field);
      setSortOrder("asc");
    }
    setCurrentPage(1); // Reset to first page
  };

  // Render sort indicator
  const renderSortIndicator = (field: string) => {
    if (sortBy !== field) return null;

    return sortOrder === "asc"
      ? <ArrowUp className="inline h-4 w-4 ml-1" />
      : <ArrowDown className="inline h-4 w-4 ml-1" />;
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between px-6 py-4">
          <div>
            <CardTitle className="text-xl">Products</CardTitle>
            <CardDescription>Manage your product inventory</CardDescription>
          </div>
          <Button
            className="bg-primary hover:bg-primary-dark text-white"
            onClick={() => setShowAddForm(true)}
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </CardHeader>
        <CardContent className="px-6">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center  sm:justify-between space-y-2 sm:space-y-0">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search products by name, type, or make"
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(parseInt(value));
                  setCurrentPage(1); // Reset to first page
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Items per page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 items</SelectItem>
                  <SelectItem value="20">20 items</SelectItem>
                  <SelectItem value="50">50 items</SelectItem>
                  <SelectItem value="100">100 items</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value);
                  setCurrentPage(1); // Reset to first page
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                  <SelectItem value="quantity">Stock</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
              >
                {sortOrder === "asc" ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>
                    Product {renderSortIndicator("name")}
                  </TableHead>
                  <TableHead>Voltage/Rating</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("price")}>
                    Price {renderSortIndicator("price")}
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("quantity")}>
                    Stock {renderSortIndicator("quantity")}
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && !products.length ? (
                  <TableSkeleton columns={7} rows={5} />
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      {debouncedSearch ? "No products match your search" : "No products found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product: Product) => {
                    const status = getStockStatus(product.quantity);

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                              {renderProductIcon(product)}
                            </div>
                            <div>
                              <div className="font-medium">{product.name}</div>
                              <div className="text-sm text-gray-500">{product.make || product.type}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {product.voltage && <div>{product.voltage}</div>}
                          {product.rating && <div>{product.rating}</div>}
                        </TableCell>
                        <TableCell>{product.unit || "Piece"}</TableCell>
                        <TableCell>{formatCurrency(product.price)}</TableCell>
                        <TableCell>{product.quantity} units</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.style)}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive"
                              onClick={() => handleDeleteProduct(product)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}

                {/* Loading indicator for next page */}
                {isFetching && products.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                )}

                {/* Intersection observer target for infinite scroll */}
                <div ref={bottomRef}></div>
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Pagination Controls */}
        {pagination && (
          <CardFooter className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalItems)} of {pagination.totalItems} products
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={!pagination.hasPrevPage}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>

              {/* Page number indicator */}
              <span className="text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => prev + 1)}
                disabled={!pagination.hasNextPage}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Add Product Dialog - Placeholder for now */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-[600px]">
          <CardHeader>
            <CardTitle>Add New Product</CardTitle>
            <CardDescription>
              Fill in the details to add a new product to your inventory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Product form will be implemented here.</p>
          </CardContent>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedProduct?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteProductMutation.mutate(selectedProduct?.id || "")}
              disabled={deleteProductMutation.isPending}
            >
              {deleteProductMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
