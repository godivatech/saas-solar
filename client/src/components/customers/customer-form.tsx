import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCustomerSchema, type InsertUnifiedCustomer } from "@shared/schema";
import { sanitizeFormData } from "@shared/utils/form-sanitizer";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// UNIFIED: Use shared customer schema directly (single source of truth)
// Empty strings in form are handled by sanitizeFormData() utility before submission
const customerFormSchema = insertCustomerSchema.omit({ profileCompleteness: true, createdFrom: true }); // Frontend doesn't need to handle these

type CustomerFormValues = z.infer<typeof customerFormSchema>;

interface CustomerFormProps {
  initialData?: CustomerFormValues & { id?: string };
  onSuccess: () => void;
  isEditing?: boolean;
}

export function CustomerForm({ initialData, onSuccess, isEditing = false }: CustomerFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const defaultValues: Partial<CustomerFormValues> = {
    name: "",
    mobile: "",
    address: "" as any,  // Form uses empty string, schema accepts null
    email: "" as any,    // Form uses empty string, schema accepts null
    ebServiceNumber: "" as any,
    propertyType: undefined,
    location: "" as any,
    scope: "" as any,
    ...initialData,
  };

  // UNIFIED: Create/Update customer mutation with unified schema
  const customerMutation = useMutation({
    mutationFn: async (data: Partial<CustomerFormValues>) => {
      const endpoint = isEditing 
        ? `/api/customers/${initialData?.id}` 
        : "/api/customers";
        
      const method = isEditing ? "PATCH" : "POST";
      
      // Add unified schema fields for new customers
      const unifiedData = {
        ...data,
        // CRITICAL: Mark as created from customers page with full profile
        ...(isEditing ? {} : {
          createdFrom: "customers_page",
          profileCompleteness: "full"
        })
      };
      
      return apiRequest(endpoint, method, unifiedData);
    },
    onSuccess: () => {
      // Invalidate all customer-related queries to refresh the UI
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          if (typeof queryKey === 'string') {
            return queryKey.includes('/api/customers') || queryKey.includes('/api/activity-logs');
          }
          return false;
        }
      });
      
      toast({
        title: `Customer ${isEditing ? "updated" : "created"} successfully`,
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save customer",
        variant: "destructive",
      });
    }
  });

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues,
  });

  const onSubmit = (data: CustomerFormValues) => {
    // CRITICAL: Use sanitizeFormData() to convert empty strings to null
    // This ensures consistency with backend schema validation
    const sanitizedData = sanitizeFormData(data, [
      'email',
      'address',
      'ebServiceNumber',
      'propertyType',
      'location',
      'scope'
    ] as const);
    
    customerMutation.mutate(sanitizedData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Customer" : "Add New Customer"}</CardTitle>
        <CardDescription>
          {isEditing 
            ? "Update customer information" 
            : "Fill in the details to add a new customer to your database."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Customer or company name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Full address" 
                      className="min-h-[100px]" 
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Email address" type="email" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="10-digit mobile number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="City, State" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="ebServiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EB Service Number</FormLabel>
                    <FormControl>
                      <Input placeholder="EB service number (optional)" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="propertyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Type</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                      value={field.value || ""}
                    >
                      <option value="">Select property type (optional)</option>
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                      <option value="agri">Agricultural</option>
                      <option value="other">Other</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Scope</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Description of projects, requirements, etc." 
                      className="min-h-[100px]" 
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Provide details about their business needs and requirements.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onSuccess()}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-primary hover:bg-primary-dark text-white"
              disabled={customerMutation.isPending}
            >
              {customerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                isEditing ? "Update Customer" : "Add Customer"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
