import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Search,
  PlusCircle,
  Pencil,
  Download,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  FileText,
  DollarSign,
  Package,
  Shield,
  Clock,
  Building2,
  Phone,
  Mail,
  MapPin,
  Zap,
  Battery,
  Droplet,
  Wind,
  Settings
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Import proper quotation types
import { type Quotation, type QuotationProject } from "@shared/schema";

// Types for pagination and quotations
interface PaginationInfo {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface QuotationsResponse {
  data: Quotation[];
  pagination: PaginationInfo;
}

// Enhanced quotation display interface with customer name populated by API
interface QuotationDisplay extends Quotation {
  customerName?: string; // Populated by API join or lookup
}

export default function Quotations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sourceFilter, setSourceFilter] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState("");
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationDisplay | null>(null);

  // Debounce search input
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);

    return () => clearTimeout(timerId);
  }, [searchQuery]);



  // Fetch quotations with pagination and filtering
  const {
    data: quotationsResponse,
    isLoading,
    isFetching,
    isError
  } = useQuery<QuotationsResponse>({
    queryKey: [`/api/quotations?page=${currentPage}&limit=${itemsPerPage}&search=${debouncedSearch}${sourceFilter && sourceFilter !== "all" ? `&source=${sourceFilter}` : ''}${projectTypeFilter && projectTypeFilter !== "all" ? `&projectType=${projectTypeFilter}` : ''}`]
  });

  const quotations: QuotationDisplay[] = quotationsResponse?.data || [];
  const pagination = quotationsResponse?.pagination;

  // Prefetch next page for smoother pagination
  useEffect(() => {
    if (pagination?.hasNextPage) {
      queryClient.prefetchQuery({
        queryKey: [`/api/quotations?page=${currentPage + 1}&limit=${itemsPerPage}&search=${debouncedSearch}${sourceFilter && sourceFilter !== "all" ? `&source=${sourceFilter}` : ''}${projectTypeFilter && projectTypeFilter !== "all" ? `&projectType=${projectTypeFilter}` : ''}`]
      });
    }
  }, [queryClient, currentPage, itemsPerPage, debouncedSearch, pagination?.hasNextPage, sourceFilter, projectTypeFilter]);

  // Status badge styles - updated for comprehensive workflow
  const statusStyles = {
    draft: "bg-gray-100 text-gray-800",
    review: "bg-orange-100 text-orange-800",
    approved: "bg-blue-100 text-blue-800",
    sent: "bg-cyan-100 text-cyan-800",
    customer_approved: "bg-green-100 text-green-800",
    converted: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800"
  };

  // Project type display helpers
  const getProjectTypesDisplay = (projects: QuotationProject[] | undefined) => {
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return 'No projects';
    }
    const types = projects.map(p => p.projectType);
    const uniqueTypes = Array.from(new Set(types));
    return uniqueTypes.map(type => type.replace('_', ' ').toUpperCase()).join(', ');
  };

  const getTotalSystemKW = (projects: QuotationProject[] | undefined) => {
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return 0;
    }
    return projects.reduce((total, project) => {
      // Handle different project types that have systemKW
      if ('systemKW' in project && typeof project.systemKW === 'number') {
        return total + project.systemKW;
      }
      return total;
    }, 0);
  };

  const hasSolarProjects = (projects: QuotationProject[] | undefined) => {
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return false;
    }
    return projects.some(p => ['on_grid', 'off_grid', 'hybrid'].includes(p.projectType));
  };

  const getSourceBadgeStyle = (source: string) => {
    return source === 'site_visit'
      ? "bg-purple-100 text-purple-800 border-purple-200"
      : "bg-blue-100 text-blue-800 border-blue-200";
  };

  // Download PDF handler using client-side generation
  const handleDownloadPDF = async (quotationId: string, quotationNumber: string) => {
    try {
      const response = await apiRequest(`/api/quotations/${quotationId}/generate-pdf`, 'POST');

      if (response.ok) {
        const data = await response.json();

        // Create a temporary iframe to render the HTML
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.left = '-10000px';
        iframe.style.top = '-10000px';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        document.body.appendChild(iframe);

        // Write the HTML content to the iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(data.html);
          iframeDoc.close();

          // Wait for content to load then trigger print
          setTimeout(() => {
            // Set the title so the PDF uses the quotation number as filename
            iframeDoc.title = `Quotation-${quotationNumber}`;
            iframe.contentWindow?.print();

            toast({
              title: "PDF Generated",
              description: "Please save or print the quotation from the print dialog.",
            });

            // Clean up after a delay
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        }
      } else {
        throw new Error('Failed to generate PDF');
      }
    } catch (error: any) {
      console.error("Error downloading PDF:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download quotation PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // View details handler
  const handleViewDetails = (quotation: QuotationDisplay) => {
    setSelectedQuotation(quotation);
    setViewDetailsOpen(true);
  };



  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between px-6 py-4">
        <div>
          <CardTitle className="text-xl">Quotations</CardTitle>
          <CardDescription>Manage your customer quotations</CardDescription>
        </div>
        <Link href="/quotations/new">
          <Button className="bg-primary hover:bg-primary-dark text-white">
            <PlusCircle className="h-4 w-4 mr-2" />
            New Quotation
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="px-6">
        <div className="mb-4 space-y-4">
          {/* Search Bar */}
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by quotation number, customer name, or project type"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-quotations"
            />
          </div>

          {/* Filters and Controls Row */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-2 lg:space-y-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Source Filter */}
              <Select
                value={sourceFilter}
                onValueChange={(value) => {
                  setSourceFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="site_visit">Site Visit</SelectItem>
                </SelectContent>
              </Select>

              {/* Project Type Filter */}
              <Select
                value={projectTypeFilter}
                onValueChange={(value) => {
                  setProjectTypeFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  <SelectItem value="on_grid">On Grid</SelectItem>
                  <SelectItem value="off_grid">Off Grid</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="water_heater">Water Heater</SelectItem>
                  <SelectItem value="water_pump">Water Pump</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(parseInt(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Items per page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 items</SelectItem>
                  <SelectItem value="20">20 items</SelectItem>
                  <SelectItem value="50">50 items</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>System KW</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Customer Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !quotations.length ? (
                <TableSkeleton columns={9} rows={5} />
              ) : quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                    {debouncedSearch || sourceFilter || projectTypeFilter ? "No quotations match your filters" : "No quotations found"}
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((quotation: QuotationDisplay) => (
                  <TableRow key={quotation.id}>
                    <TableCell className="font-medium">
                      <div className="font-mono text-sm">
                        {quotation.quotationNumber || `Q-${quotation.id.substring(0, 6)}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[150px]">
                        <div className="font-medium text-sm truncate">
                          {quotation.customerName || "Unknown Customer"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[120px]">
                        <div className="text-xs text-gray-600 truncate">
                          {getProjectTypesDisplay(quotation.projects)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {quotation.projects?.length || 0} project{(quotation.projects?.length || 0) !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {getTotalSystemKW(quotation.projects) > 0 ? `${getTotalSystemKW(quotation.projects)} kW` : '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", getSourceBadgeStyle(quotation.source))}>
                        {quotation.source === 'site_visit' ? 'Site Visit' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(quotation.totalCustomerPayment)}</div>
                        {quotation.totalSubsidyAmount > 0 && hasSolarProjects(quotation.projects) && (
                          <div className="text-xs text-green-600">
                            Subsidy: {formatCurrency(quotation.totalSubsidyAmount)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium capitalize text-xs",
                        quotation.status in statusStyles
                          ? statusStyles[quotation.status as keyof typeof statusStyles]
                          : "bg-gray-100"
                      )}>
                        {quotation.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        {formatDate(quotation.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="View Details"
                          data-testid={`button-view-${quotation.id}`}
                          onClick={() => handleViewDetails(quotation)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Link href={`/quotations/${quotation.id}/edit`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Edit Quotation"
                            data-testid={`button-edit-${quotation.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Download PDF"
                          data-testid={`button-download-${quotation.id}`}
                          onClick={() => handleDownloadPDF(quotation.id, quotation.quotationNumber)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}

              {/* Loading indicator for next page */}
              {isFetching && quotations.length > 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Pagination Controls */}
      {pagination && (
        <CardFooter className="flex items-center justify-between px-6 py-4 border-t">
          <div className="text-sm text-gray-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalItems)} of {pagination.totalItems} quotations
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

      {/* View Details Modal */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-xl font-semibold">
                    {selectedQuotation?.quotationNumber}
                  </div>
                  <div className="text-sm text-gray-500 font-normal mt-1">
                    {selectedQuotation?.customerName}
                  </div>
                </div>
              </div>
              <Badge className={cn("text-xs", selectedQuotation?.status && statusStyles[selectedQuotation.status as keyof typeof statusStyles] ? statusStyles[selectedQuotation.status as keyof typeof statusStyles] : "bg-gray-100 text-gray-800")}>
                {selectedQuotation?.status?.replace('_', ' ').toUpperCase()}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="summary" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Summary
              </TabsTrigger>
              <TabsTrigger value="projects" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Projects
              </TabsTrigger>
              <TabsTrigger value="financials" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Financials
              </TabsTrigger>
              <TabsTrigger value="compliance" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Compliance
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(90vh-200px)] mt-4">
              {/* Summary Tab */}
              <TabsContent value="summary" className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Total Value</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {formatCurrency(selectedQuotation?.totalCustomerPayment || 0)}
                          </p>
                        </div>
                        <DollarSign className="h-8 w-8 text-blue-600 opacity-20" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">System Capacity</p>
                          <p className="text-2xl font-bold text-green-600">
                            {getTotalSystemKW(selectedQuotation?.projects)} kW
                          </p>
                        </div>
                        <Zap className="h-8 w-8 text-green-600 opacity-20" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Version</p>
                          <p className="text-2xl font-bold text-purple-600">
                            R{selectedQuotation?.documentVersion || 1}
                          </p>
                        </div>
                        <FileText className="h-8 w-8 text-purple-600 opacity-20" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Customer Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-5 w-5" />
                      Customer Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Customer Name</p>
                          <p className="font-medium">{selectedQuotation?.customerName || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Source</p>
                          <Badge variant="outline" className="mt-1">
                            {selectedQuotation?.source?.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Calendar className="h-4 w-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Created Date</p>
                          <p className="font-medium">{formatDate(selectedQuotation?.createdAt) || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Last Updated</p>
                          <p className="font-medium">{formatDate(selectedQuotation?.updatedAt) || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <DollarSign className="h-5 w-5" />
                      Payment Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">System Cost</span>
                      <span className="font-semibold">{formatCurrency(selectedQuotation?.totalSystemCost || 0)}</span>
                    </div>
                    {hasSolarProjects(selectedQuotation?.projects) && (
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600">Subsidy Amount</span>
                        <span className="font-semibold text-green-600">-{formatCurrency(selectedQuotation?.totalSubsidyAmount || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2 border-b font-bold">
                      <span className="text-gray-900">Customer Payment</span>
                      <span className="text-blue-600 text-lg">{formatCurrency(selectedQuotation?.totalCustomerPayment || 0)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                      <div>
                        <p className="text-sm text-gray-500">Advance ({selectedQuotation?.advancePaymentPercentage}%)</p>
                        <p className="font-semibold text-lg">{formatCurrency(selectedQuotation?.advanceAmount || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Balance</p>
                        <p className="font-semibold text-lg">{formatCurrency(selectedQuotation?.balanceAmount || 0)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Terms & Delivery */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="h-5 w-5" />
                      Terms & Delivery
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Payment Terms</p>
                      <p className="font-medium mt-1">{selectedQuotation?.paymentTerms?.replace(/_/g, ' ').toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Delivery Timeframe</p>
                      <p className="font-medium mt-1">{selectedQuotation?.deliveryTimeframe?.replace(/_/g, ' ')}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                {(selectedQuotation?.customerNotes || selectedQuotation?.internalNotes) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FileText className="h-5 w-5" />
                        Notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedQuotation?.customerNotes && (
                        <div>
                          <p className="text-sm text-gray-500 font-medium mb-1">Customer Notes</p>
                          <p className="text-sm bg-gray-50 p-3 rounded-md">{selectedQuotation.customerNotes}</p>
                        </div>
                      )}
                      {selectedQuotation?.internalNotes && (
                        <div>
                          <p className="text-sm text-gray-500 font-medium mb-1">Internal Notes</p>
                          <p className="text-sm bg-gray-50 p-3 rounded-md">{selectedQuotation.internalNotes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Projects Tab */}
              <TabsContent value="projects" className="space-y-4">
                <Accordion type="single" collapsible className="w-full">
                  {selectedQuotation?.projects?.map((project, index) => (
                    <AccordionItem key={index} value={`project-${index}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            {project.projectType === 'on_grid' && <Zap className="h-5 w-5 text-yellow-600" />}
                            {project.projectType === 'off_grid' && <Battery className="h-5 w-5 text-blue-600" />}
                            {project.projectType === 'hybrid' && <Zap className="h-5 w-5 text-purple-600" />}
                            {project.projectType === 'water_heater' && <Droplet className="h-5 w-5 text-orange-600" />}
                            {project.projectType === 'water_pump' && <Wind className="h-5 w-5 text-cyan-600" />}
                            <span className="font-semibold">
                              Project {index + 1}: {project.projectType?.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                          <Badge variant="outline">{formatCurrency(project.customerPayment || 0)}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <Card className="mt-2">
                          <CardContent className="p-4 space-y-4">
                            {/* System Specifications for Solar Projects */}
                            {(project.projectType === 'on_grid' || project.projectType === 'off_grid' || project.projectType === 'hybrid') && (
                              <>
                                <div>
                                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Zap className="h-4 w-4" />
                                    System Specifications
                                  </h4>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                      <span className="text-gray-600">System Capacity:</span>
                                      <span className="font-medium">{project.systemKW} kW</span>
                                    </div>
                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                      <span className="text-gray-600">Price per kW:</span>
                                      <span className="font-medium">{formatCurrency(project.pricePerKW || 0)}</span>
                                    </div>
                                  </div>
                                </div>

                                <Separator />

                                {/* Installation Details */}
                                <div>
                                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Installation Details
                                  </h4>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                      <span className="text-gray-600">Floor Level:</span>
                                      <span className="font-medium">{project.floor === '0' ? 'Ground Floor' : `${project.floor}${project.floor === '1' ? 'st' : project.floor === '2' ? 'nd' : project.floor === '3' ? 'rd' : 'th'} Floor`}</span>
                                    </div>
                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                      <span className="text-gray-600">Structure Type:</span>
                                      <span className="font-medium">
                                        {project.structureType === 'gp_structure' ? 'GP Structure' :
                                          project.structureType === 'gi_structure' ? 'GI Structure' :
                                            project.structureType === 'gi_round_pipe' ? 'GI Round Pipe' :
                                              project.structureType === 'ms_square_pipe' ? 'MS Square Pipe' :
                                                project.structureType === 'mono_rail' ? 'Mono Rail' : 'N/A'}
                                      </span>
                                    </div>
                                    {(project.structureType === 'gp_structure' ||
                                      project.structureType === 'gi_structure' ||
                                      project.structureType === 'gi_round_pipe' ||
                                      project.structureType === 'ms_square_pipe') && (
                                        <>
                                          <div className="flex justify-between p-2 bg-gray-50 rounded">
                                            <span className="text-gray-600">Lower End Height:</span>
                                            <span className="font-medium">{project.gpStructure?.lowerEndHeight || 'N/A'} ft</span>
                                          </div>
                                          <div className="flex justify-between p-2 bg-gray-50 rounded">
                                            <span className="text-gray-600">Higher End Height:</span>
                                            <span className="font-medium">{project.gpStructure?.higherEndHeight || 'N/A'} ft</span>
                                          </div>
                                        </>
                                      )}
                                    {project.structureType === 'mono_rail' && (
                                      <div className="flex justify-between p-2 bg-gray-50 rounded col-span-2">
                                        <span className="text-gray-600">Mono Rail Type:</span>
                                        <span className="font-medium">{project.monoRail?.type === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <Separator />

                                {/* Solar Panel Details */}
                                <div>
                                  <h4 className="font-semibold mb-3">Solar Panel Details</h4>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="space-y-1">
                                      <span className="text-gray-600">Make:</span>
                                      <p className="font-medium">{project.solarPanelMake?.join(', ') || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-gray-600">Wattage:</span>
                                      <p className="font-medium">{project.panelWatts}W</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-gray-600">Panel Count:</span>
                                      <p className="font-medium">{project.panelCount} panels</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-gray-600">DCR Panels:</span>
                                      <p className="font-medium">{project.dcrPanelCount || 0}</p>
                                    </div>
                                  </div>
                                </div>

                                <Separator />

                                {/* Inverter Details */}
                                <div>
                                  <h4 className="font-semibold mb-3">Inverter Details</h4>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="space-y-1">
                                      <span className="text-gray-600">Make:</span>
                                      <p className="font-medium">{project.inverterMake?.join(', ') || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-gray-600">Phase:</span>
                                      <p className="font-medium">{project.inverterPhase}</p>
                                    </div>
                                    {(project.projectType === 'off_grid' || project.projectType === 'hybrid') ? (
                                      (project.inverterKVA || project.inverterKW) && (
                                        <div className="space-y-1">
                                          <span className="text-gray-600">Capacity:</span>
                                          <p className="font-medium">{project.inverterKVA || project.inverterKW} KVA</p>
                                        </div>
                                      )
                                    ) : (
                                      project.inverterKW && (
                                        <div className="space-y-1">
                                          <span className="text-gray-600">Capacity:</span>
                                          <p className="font-medium">{project.inverterKW} kW</p>
                                        </div>
                                      )
                                    )}
                                    {project.inverterQty && (
                                      <div className="space-y-1">
                                        <span className="text-gray-600">Quantity:</span>
                                        <p className="font-medium">{project.inverterQty}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Battery Details for Off-grid/Hybrid */}
                                {(project.projectType === 'off_grid' || project.projectType === 'hybrid') && project.batteryBrand && (
                                  <>
                                    <Separator />
                                    <div>
                                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Battery className="h-4 w-4" />
                                        Battery Details
                                      </h4>
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="space-y-1">
                                          <span className="text-gray-600">Brand:</span>
                                          <p className="font-medium">{project.batteryBrand}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-gray-600">Type:</span>
                                          <p className="font-medium">{project.batteryType || 'N/A'}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-gray-600">Capacity:</span>
                                          <p className="font-medium">{project.batteryAH || 'N/A'}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-gray-600">Voltage:</span>
                                          <p className="font-medium">{project.voltage}V</p>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-gray-600">Battery Count:</span>
                                          <p className="font-medium">{project.batteryCount}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </>
                            )}

                            {/* Water Heater Details */}
                            {project.projectType === 'water_heater' && (
                              <div>
                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                  <Droplet className="h-4 w-4" />
                                  Water Heater Specifications
                                </h4>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div className="space-y-1">
                                    <span className="text-gray-600">Brand:</span>
                                    <p className="font-medium">{project.brand}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-gray-600">Capacity:</span>
                                    <p className="font-medium">{project.litre} Litres</p>
                                  </div>
                                  {project.heatingCoil && (
                                    <div className="space-y-1">
                                      <span className="text-gray-600">Heating Coil:</span>
                                      <p className="font-medium">{project.heatingCoil}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Water Pump Details */}
                            {project.projectType === 'water_pump' && (
                              <>
                                <div>
                                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    Installation Details
                                  </h4>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                                      <span className="text-gray-600">Structure Type:</span>
                                      <span className="font-medium">
                                        {project.structureType === 'gp_structure' ? 'GP Structure' :
                                          project.structureType === 'gi_structure' ? 'GI Structure' :
                                            project.structureType === 'gi_round_pipe' ? 'GI Round Pipe' :
                                              project.structureType === 'ms_square_pipe' ? 'MS Square Pipe' :
                                                project.structureType === 'mono_rail' ? 'Mono Rail' : 'N/A'}
                                      </span>
                                    </div>
                                    {(project.structureType === 'gp_structure' ||
                                      project.structureType === 'gi_structure' ||
                                      project.structureType === 'gi_round_pipe' ||
                                      project.structureType === 'ms_square_pipe') && (
                                        <>
                                          <div className="flex justify-between p-2 bg-gray-50 rounded">
                                            <span className="text-gray-600">Lower End Height:</span>
                                            <span className="font-medium">{project.gpStructure?.lowerEndHeight || 'N/A'} ft</span>
                                          </div>
                                          <div className="flex justify-between p-2 bg-gray-50 rounded">
                                            <span className="text-gray-600">Higher End Height:</span>
                                            <span className="font-medium">{project.gpStructure?.higherEndHeight || 'N/A'} ft</span>
                                          </div>
                                        </>
                                      )}
                                    {project.structureType === 'mono_rail' && (
                                      <div className="flex justify-between p-2 bg-gray-50 rounded col-span-2">
                                        <span className="text-gray-600">Mono Rail Type:</span>
                                        <span className="font-medium">{project.monoRail?.type === 'mini_rail' ? 'Mini Rail' : 'Long Rail'}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <Separator />

                                <div>
                                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Wind className="h-4 w-4" />
                                    Water Pump Specifications
                                  </h4>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="space-y-1">
                                      <span className="text-gray-600">HP:</span>
                                      <p className="font-medium">{project.hp}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-gray-600">Drive:</span>
                                      <p className="font-medium">{project.drive}</p>
                                    </div>
                                    {project.solarPanel && (
                                      <div className="space-y-1">
                                        <span className="text-gray-600">Solar Panel:</span>
                                        <p className="font-medium">{project.solarPanel}</p>
                                      </div>
                                    )}
                                    {project.panelCount && (
                                      <div className="space-y-1">
                                        <span className="text-gray-600">Panel Count:</span>
                                        <p className="font-medium">{project.panelCount}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}

                            <Separator />

                            {/* Pricing Breakdown */}
                            <div>
                              <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <DollarSign className="h-4 w-4" />
                                Pricing Breakdown
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between p-2 bg-gray-50 rounded">
                                  <span className="text-gray-600">Base Price:</span>
                                  <span className="font-medium">{formatCurrency(project.basePrice || 0)}</span>
                                </div>
                                <div className="flex justify-between p-2 bg-gray-50 rounded">
                                  <span className="text-gray-600">GST ({project.gstPercentage}%):</span>
                                  <span className="font-medium">{formatCurrency(project.gstAmount || 0)}</span>
                                </div>
                                <div className="flex justify-between p-2 bg-gray-50 rounded">
                                  <span className="text-gray-600">Project Value:</span>
                                  <span className="font-medium">{formatCurrency(project.projectValue || 0)}</span>
                                </div>
                                {['on_grid', 'off_grid', 'hybrid'].includes(project.projectType) && (
                                  <div className="flex justify-between p-2 bg-green-50 rounded">
                                    <span className="text-gray-600">Subsidy:</span>
                                    <span className="font-medium text-green-600">-{formatCurrency(project.subsidyAmount || 0)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between p-2 bg-blue-50 rounded font-semibold">
                                  <span className="text-gray-900">Customer Payment:</span>
                                  <span className="text-blue-600">{formatCurrency(project.customerPayment || 0)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Installation Notes */}
                            {project.installationNotes && (
                              <>
                                <Separator />
                                <div>
                                  <h4 className="font-semibold mb-2">Installation Notes</h4>
                                  <p className="text-sm bg-gray-50 p-3 rounded-md">{project.installationNotes}</p>
                                </div>
                              </>
                            )}

                            {/* Warranty Information */}
                            {project.warranty && (
                              <>
                                <Separator />
                                <div>
                                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Shield className="h-4 w-4" />
                                    Warranty
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    {'panel' in project.warranty && project.warranty.panel && (
                                      <div className="p-2 bg-green-50 rounded">
                                        <span className="text-gray-600">Panel:</span>
                                        <span className="font-medium ml-2">{project.warranty.panel.replace('_', ' ')}</span>
                                      </div>
                                    )}
                                    {'inverter' in project.warranty && project.warranty.inverter && (
                                      <div className="p-2 bg-blue-50 rounded">
                                        <span className="text-gray-600">Inverter:</span>
                                        <span className="font-medium ml-2">{project.warranty.inverter.replace('_', ' ')}</span>
                                      </div>
                                    )}
                                    {'battery' in project.warranty && project.warranty.battery && (
                                      <div className="p-2 bg-purple-50 rounded">
                                        <span className="text-gray-600">Battery:</span>
                                        <span className="font-medium ml-2">{project.warranty.battery.replace('_', ' ')}</span>
                                      </div>
                                    )}
                                    {'installation' in project.warranty && project.warranty.installation && (
                                      <div className="p-2 bg-orange-50 rounded">
                                        <span className="text-gray-600">Installation:</span>
                                        <span className="font-medium ml-2">{project.warranty.installation.replace('_', ' ')}</span>
                                      </div>
                                    )}
                                    {'heater' in project.warranty && project.warranty.heater && (
                                      <div className="p-2 bg-red-50 rounded">
                                        <span className="text-gray-600">Heater:</span>
                                        <span className="font-medium ml-2">{project.warranty.heater.replace('_', ' ')}</span>
                                      </div>
                                    )}
                                    {'pump' in project.warranty && project.warranty.pump && (
                                      <div className="p-2 bg-cyan-50 rounded">
                                        <span className="text-gray-600">Pump:</span>
                                        <span className="font-medium ml-2">{project.warranty.pump.replace('_', ' ')}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </CardContent>
                        </Card>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>

              {/* Financials Tab */}
              <TabsContent value="financials" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Financial Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <p className="text-sm text-gray-600 mb-1">Total System Cost</p>
                          <p className="text-2xl font-bold text-blue-600">{formatCurrency(selectedQuotation?.totalSystemCost || 0)}</p>
                        </div>
                        {hasSolarProjects(selectedQuotation?.projects) && (
                          <div className="p-4 bg-green-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Total Subsidy</p>
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(selectedQuotation?.totalSubsidyAmount || 0)}</p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="p-4 bg-purple-50 rounded-lg">
                          <p className="text-sm text-gray-600 mb-1">Customer Payment</p>
                          <p className="text-2xl font-bold text-purple-600">{formatCurrency(selectedQuotation?.totalCustomerPayment || 0)}</p>
                        </div>
                        <div className="p-4 bg-orange-50 rounded-lg">
                          <p className="text-sm text-gray-600 mb-1">GST Total</p>
                          <p className="text-2xl font-bold text-orange-600">
                            {formatCurrency(
                              selectedQuotation?.projects?.reduce((sum, p) => sum + (p.gstAmount || 0), 0) || 0
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Payment Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-600">Advance Payment ({selectedQuotation?.advancePaymentPercentage}%)</p>
                        <p className="text-xs text-gray-500 mt-1">Due at order confirmation</p>
                      </div>
                      <p className="text-xl font-bold text-blue-600">{formatCurrency(selectedQuotation?.advanceAmount || 0)}</p>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-600">Balance Payment</p>
                        <p className="text-xs text-gray-500 mt-1">Due at installation completion</p>
                      </div>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(selectedQuotation?.balanceAmount || 0)}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Account Details */}
                {selectedQuotation?.accountDetails && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Bank Account Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Bank Name</p>
                          <p className="font-medium mt-1">{selectedQuotation.accountDetails.bankName}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Account Holder</p>
                          <p className="font-medium mt-1">{selectedQuotation.accountDetails.accountHolderName}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Account Number</p>
                          <p className="font-medium mt-1">{selectedQuotation.accountDetails.accountNumber}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">IFSC Code</p>
                          <p className="font-medium mt-1">{selectedQuotation.accountDetails.ifscCode}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Branch</p>
                          <p className="font-medium mt-1">{selectedQuotation.accountDetails.branch}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Compliance Tab */}
              <TabsContent value="compliance" className="space-y-4">
                {/* Warranty Terms */}
                {selectedQuotation?.detailedWarrantyTerms && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Detailed Warranty Terms
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedQuotation.detailedWarrantyTerms.solarPanels && (
                        <div>
                          <h4 className="font-semibold mb-2 text-green-600">Solar Panels</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex items-start gap-2">
                              <Shield className="h-4 w-4 mt-0.5 text-green-600" />
                              <span>{selectedQuotation.detailedWarrantyTerms.solarPanels.manufacturingDefect}</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Shield className="h-4 w-4 mt-0.5 text-green-600" />
                              <span>{selectedQuotation.detailedWarrantyTerms.solarPanels.serviceWarranty}</span>
                            </li>
                            {selectedQuotation.detailedWarrantyTerms.solarPanels.performanceWarranty?.map((term, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <Shield className="h-4 w-4 mt-0.5 text-green-600" />
                                <span>{term}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {selectedQuotation.detailedWarrantyTerms.inverter && (
                        <div>
                          <h4 className="font-semibold mb-2 text-blue-600">Inverter</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex items-start gap-2">
                              <Shield className="h-4 w-4 mt-0.5 text-blue-600" />
                              <span>{selectedQuotation.detailedWarrantyTerms.inverter.replacementWarranty}</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Shield className="h-4 w-4 mt-0.5 text-blue-600" />
                              <span>{selectedQuotation.detailedWarrantyTerms.inverter.serviceWarranty}</span>
                            </li>
                          </ul>
                        </div>
                      )}

                      {selectedQuotation.detailedWarrantyTerms.installation && (
                        <div>
                          <h4 className="font-semibold mb-2 text-orange-600">Installation</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex items-start gap-2">
                              <Shield className="h-4 w-4 mt-0.5 text-orange-600" />
                              <span>{selectedQuotation.detailedWarrantyTerms.installation.warrantyPeriod}</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Shield className="h-4 w-4 mt-0.5 text-orange-600" />
                              <span>{selectedQuotation.detailedWarrantyTerms.installation.serviceWarranty}</span>
                            </li>
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Physical Damage Exclusions */}
                {selectedQuotation?.physicalDamageExclusions?.enabled && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-red-600 flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Important Notice
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-medium text-red-600 bg-red-50 p-3 rounded-md">
                        {selectedQuotation.physicalDamageExclusions.disclaimerText}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Document Requirements - Only show for solar projects */}
                {selectedQuotation?.documentRequirements && hasSolarProjects(selectedQuotation?.projects) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Required Documents for Subsidy
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {selectedQuotation.documentRequirements.subsidyDocuments?.map((doc, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span className="text-sm">{doc}</span>
                          </div>
                        ))}
                      </div>
                      {selectedQuotation.documentRequirements.note && (
                        <div className="bg-yellow-50 p-3 rounded-md">
                          <p className="text-sm text-yellow-800 font-medium">{selectedQuotation.documentRequirements.note}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Revision History */}
                {selectedQuotation?.revisionHistory && selectedQuotation.revisionHistory.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Revision History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {selectedQuotation.revisionHistory.map((revision, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                            <Badge variant="outline" className="mt-0.5">R{revision.version}</Badge>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium">Updated by {revision.updatedBy}</p>
                                <p className="text-xs text-gray-500">{formatDate(revision.updatedAt)}</p>
                              </div>
                              {revision.changeNote && (
                                <p className="text-sm text-gray-600">{revision.changeNote}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
