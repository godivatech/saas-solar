import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/auth-context";
import { sanitizeFormData } from "../../../shared/utils/form-sanitizer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapPin, PlusCircle, Trash2, Edit, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

export default function OfficeLocations() {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "Godiva Solar Head Office",
    latitude: "9.966844592415782",
    longitude: "78.1338405791111",
    radius: "100", // Default radius in meters
  });

  // Only master_admin can access this page
  if (user?.role !== "master_admin") {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <MapPin className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Access Denied</h3>
            <p className="text-sm text-gray-500 mt-2">
              You don't have permission to access this page. This area is restricted to master administrators.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fetch office locations
  const {
    data: officeLocations = [] as Array<{
      id: string;
      name: string;
      latitude: string;
      longitude: string;
      radius: number;
      createdAt: string;
      updatedAt: string;
    }>,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["/api/office-locations"],
  });

  // Create new office location
  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const sanitized = sanitizeFormData(data, ['address']);
      return apiRequest('/api/office-locations', 'POST', sanitized);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/office-locations"] });
      toast({
        title: "Office Location Created",
        description: "The office location has been added successfully.",
      });
      resetForm();
      setIsAddLocationOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update office location
  const updateLocationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const sanitized = sanitizeFormData(data, ['address']);
      return apiRequest(`/api/office-locations/${id}`, 'PATCH', sanitized);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/office-locations"] });
      toast({
        title: "Office Location Updated",
        description: "The office location has been updated successfully.",
      });
      resetForm();
      setIsEditLocationOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete office location
  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/office-locations/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/office-locations"] });
      toast({
        title: "Office Location Deleted",
        description: "The office location has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Handle create form submission
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.name || !formData.latitude || !formData.longitude || !formData.radius) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate coordinates format
    const latRegex = /^-?([1-8]?[0-9](\.[0-9]+)?|90(\.0+)?)$/;
    const longRegex = /^-?((1[0-7][0-9]|[1-9]?[0-9])(\.[0-9]+)?|180(\.0+)?)$/;
    
    if (!latRegex.test(formData.latitude)) {
      toast({
        title: "Validation Error",
        description: "Latitude must be a valid number between -90 and 90.",
        variant: "destructive",
      });
      return;
    }
    
    if (!longRegex.test(formData.longitude)) {
      toast({
        title: "Validation Error",
        description: "Longitude must be a valid number between -180 and 180.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate radius
    const radius = parseInt(formData.radius);
    if (isNaN(radius) || radius < 50 || radius > 5000) {
      toast({
        title: "Validation Error",
        description: "Radius must be a number between 50 and 5000 meters.",
        variant: "destructive",
      });
      return;
    }
    
    // Submit the form
    createLocationMutation.mutate({
      name: formData.name,
      latitude: formData.latitude,
      longitude: formData.longitude,
      radius: parseInt(formData.radius),
    });
  };

  // Handle edit form submission
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.name || !formData.latitude || !formData.longitude || !formData.radius) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate coordinates format
    const latRegex = /^-?([1-8]?[0-9](\.[0-9]+)?|90(\.0+)?)$/;
    const longRegex = /^-?((1[0-7][0-9]|[1-9]?[0-9])(\.[0-9]+)?|180(\.0+)?)$/;
    
    if (!latRegex.test(formData.latitude)) {
      toast({
        title: "Validation Error",
        description: "Latitude must be a valid number between -90 and 90.",
        variant: "destructive",
      });
      return;
    }
    
    if (!longRegex.test(formData.longitude)) {
      toast({
        title: "Validation Error",
        description: "Longitude must be a valid number between -180 and 180.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate radius
    const radius = parseInt(formData.radius);
    if (isNaN(radius) || radius < 50 || radius > 5000) {
      toast({
        title: "Validation Error",
        description: "Radius must be a number between 50 and 5000 meters.",
        variant: "destructive",
      });
      return;
    }
    
    // Submit the form
    updateLocationMutation.mutate({
      id: editingLocation.id,
      data: {
        name: formData.name,
        latitude: formData.latitude,
        longitude: formData.longitude,
        radius: parseInt(formData.radius),
      },
    });
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      latitude: "",
      longitude: "",
      radius: "100",
    });
    setEditingLocation(null);
  };

  // Handle edit button click
  const handleEditClick = (location: any) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      radius: location.radius.toString(),
    });
    setIsEditLocationOpen(true);
  };

  // Handle delete button click
  const handleDeleteClick = (id: string) => {
    if (window.confirm("Are you sure you want to delete this office location?")) {
      deleteLocationMutation.mutate(id);
    }
  };

  // Handle dialog close
  const handleDialogClose = () => {
    resetForm();
    setIsAddLocationOpen(false);
    setIsEditLocationOpen(false);
  };

  // Get current location for form
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData({
            ...formData,
            latitude: position.coords.latitude.toString(),
            longitude: position.coords.longitude.toString(),
          });
          
          toast({
            title: "Location Detected",
            description: "Your current location has been filled in the form.",
          });
        },
        (error) => {
          let errorMessage = "Unable to retrieve your location";
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied. Please enable location services.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information is unavailable.";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out.";
              break;
          }
          
          toast({
            title: "Location Error",
            description: errorMessage,
            variant: "destructive",
          });
        }
      );
    } else {
      toast({
        title: "Geolocation Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
    }
  };

  // Update office location to current GPS coordinates
  const updateToCurrentLocation = (location: any) => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
      return;
    }

    // Use high accuracy GPS settings
    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Confirm with user before updating
        const confirmed = window.confirm(
          `Update "${location.name}" to your current location?\n\n` +
          `Current coordinates: ${location.latitude}, ${location.longitude}\n` +
          `New coordinates: ${position.coords.latitude.toFixed(8)}, ${position.coords.longitude.toFixed(8)}\n` +
          `GPS accuracy: ±${position.coords.accuracy.toFixed(0)}m`
        );

        if (confirmed) {
          updateLocationMutation.mutate({
            id: location.id,
            data: {
              latitude: position.coords.latitude.toString(),
              longitude: position.coords.longitude.toString(),
              radius: location.radius // Keep existing radius
            }
          });
        }
      },
      (error) => {
        let errorMessage = "Unable to get your current location";
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. Please enable location services.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out. Please try again.";
            break;
        }
        
        toast({
          title: "Location Error",
          description: errorMessage,
          variant: "destructive",
        });
      },
      options
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Office Locations</CardTitle>
            <CardDescription>
              Manage office locations for geo-fencing and attendance tracking
            </CardDescription>
          </div>
          <Button
            onClick={() => setIsAddLocationOpen(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Location
          </Button>
        </CardHeader>
        
        <CardContent>
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to load office locations. Please try again later.
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (officeLocations as any[]).length === 0 ? (
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Office Locations</h3>
              <p className="text-sm text-gray-500 mb-4">
                You haven't added any office locations yet. Add your first location to enable geo-fencing features.
              </p>
              <Button
                onClick={() => setIsAddLocationOpen(true)}
                className="bg-primary hover:bg-primary/90"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Add First Location
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Coordinates</TableHead>
                    <TableHead>Radius</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(officeLocations as any[]).map((location: any) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell>
                        {location.latitude}, {location.longitude}
                      </TableCell>
                      <TableCell>{location.radius} meters</TableCell>
                      <TableCell>{formatDate(new Date(location.createdAt))}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateToCurrentLocation(location)}
                            title="Update to my current location"
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(location)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDeleteClick(location.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Office Location Dialog */}
      <Dialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>Add Office Location</DialogTitle>
              <DialogDescription>
                Add a new office location for geo-fencing. This will be used to track employee attendance.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Main Office"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="latitude" className="text-right">
                  Latitude
                </Label>
                <Input
                  id="latitude"
                  name="latitude"
                  placeholder="28.6139"
                  value={formData.latitude}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="longitude" className="text-right">
                  Longitude
                </Label>
                <Input
                  id="longitude"
                  name="longitude"
                  placeholder="77.2090"
                  value={formData.longitude}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="radius" className="text-right">
                  Radius (m)
                </Label>
                <Input
                  id="radius"
                  name="radius"
                  type="number"
                  min="50"
                  max="5000"
                  placeholder="100"
                  value={formData.radius}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={getCurrentLocation}
                  className="w-full"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Use Current Location
                </Button>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleDialogClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createLocationMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {createLocationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Location"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Office Location Dialog */}
      <Dialog open={isEditLocationOpen} onOpenChange={setIsEditLocationOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Office Location</DialogTitle>
              <DialogDescription>
                Update the office location details for geo-fencing.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-right">
                  Name
                </Label>
                <Input
                  id="edit-name"
                  name="name"
                  placeholder="Main Office"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-latitude" className="text-right">
                  Latitude
                </Label>
                <Input
                  id="edit-latitude"
                  name="latitude"
                  placeholder="28.6139"
                  value={formData.latitude}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-longitude" className="text-right">
                  Longitude
                </Label>
                <Input
                  id="edit-longitude"
                  name="longitude"
                  placeholder="77.2090"
                  value={formData.longitude}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-radius" className="text-right">
                  Radius (m)
                </Label>
                <Input
                  id="edit-radius"
                  name="radius"
                  type="number"
                  min="50"
                  max="5000"
                  placeholder="100"
                  value={formData.radius}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={getCurrentLocation}
                  className="w-full"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Use Current Location
                </Button>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleDialogClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateLocationMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {updateLocationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Location"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
