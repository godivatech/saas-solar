import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TimeDisplay } from "@/components/time/time-display";
import { formatDate } from "@/lib/utils";
import { Eye, Edit, MapPin, Camera, Clock, Users } from "lucide-react";

interface AttendanceTableProps {
  attendanceRecords: any[];
  onEditAttendance: (attendance: any) => void;
  onViewImage: (imageData: any) => void;
  selectedRecords: Set<string>;
  onSelectRecord: (recordId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
}

export function AttendanceTable({
  attendanceRecords,
  onEditAttendance,
  onViewImage,
  selectedRecords,
  onSelectRecord,
  onSelectAll
}: AttendanceTableProps) {
  if (attendanceRecords.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No attendance records found</h3>
        <p className="text-muted-foreground">
          No attendance data available for the selected date and filters.
        </p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'default';
      case 'late': return 'destructive';
      case 'absent': return 'secondary';
      case 'leave': return 'outline';
      default: return 'secondary';
    }
  };

  const getAttendanceTypeColor = (type: string) => {
    switch (type) {
      case 'office': return 'default';
      case 'remote': return 'secondary';
      case 'field_work': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Attendance Records ({attendanceRecords.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedRecords.size === attendanceRecords.length && attendanceRecords.length > 0}
              onCheckedChange={(checked) => onSelectAll(!!checked)}
            />
            <span className="text-sm text-muted-foreground">Select All</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile Card View (visible on small screens) */}
        <div className="block md:hidden space-y-4">
          {attendanceRecords.map((record) => (
            <Card key={record.id} className="border shadow-sm">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Header with checkbox and employee info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedRecords.has(record.id)}
                        onCheckedChange={(checked) => onSelectRecord(record.id, !!checked)}
                      />
                      <div>
                        <p className="font-medium text-base">{record.userName}</p>
                        <p className="text-sm text-muted-foreground">{record.userEmail}</p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {record.userDepartment?.toUpperCase() || 'N/A'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(record.checkInImageUrl || record.checkOutImageUrl) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewImage({
                            url: record.checkInImageUrl || record.checkOutImageUrl,
                            employeeName: record.userName,
                            date: formatDate(new Date(record.date)),
                            time: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : 'N/A',
                            attendanceType: record.attendanceType,
                            customerName: record.customerName,
                            location: record.isWithinOfficeRadius ? 'Office' : 'Remote'
                          })}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditAttendance(record)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Time and Status Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Check In</p>
                      {record.checkInTime ? (
                        <div className="flex items-center gap-2 mt-1">
                          <TimeDisplay time={record.checkInTime} format12Hour={true} />
                          {record.isLate && (
                            <Badge variant="destructive" className="text-xs">
                              Late
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Not checked in</span>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Check Out</p>
                      {record.checkOutTime ? (
                        <TimeDisplay time={record.checkOutTime} format12Hour={true} />
                      ) : (
                        <span className="text-gray-400">Not checked out</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Status and Type Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={getAttendanceTypeColor(record.attendanceType)}>
                      {record.attendanceType === 'field_work' ? 'Field Work' : 
                       record.attendanceType?.charAt(0).toUpperCase() + record.attendanceType?.slice(1) || 'Office'}
                    </Badge>
                    <Badge variant={getStatusColor(record.status)}>
                      {record.status?.charAt(0).toUpperCase() + record.status?.slice(1) || 'Present'}
                    </Badge>
                    {record.isWithinOfficeRadius ? (
                      <Badge variant="default" className="text-xs">
                        <MapPin className="h-3 w-3 mr-1" />
                        Office
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <MapPin className="h-3 w-3 mr-1" />
                        Remote
                      </Badge>
                    )}
                  </div>
                  
                  {/* Working Hours and Overtime */}
                  <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                    <div>
                      <p className="text-muted-foreground">Working Hours</p>
                      {record.workingHours ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          <span>{record.workingHours.toFixed(1)}h</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Overtime</p>
                      {record.overtimeHours && record.overtimeHours > 0 ? (
                        <Badge variant="secondary" className="text-xs mt-1">
                          {record.overtimeHours.toFixed(1)}h OT
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Desktop Table View (hidden on small screens) */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Working Hours</TableHead>
                <TableHead>Overtime</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceRecords.map((record) => (
                <TableRow key={record.id} className="hover:bg-gray-50">
                  <TableCell>
                    <Checkbox
                      checked={selectedRecords.has(record.id)}
                      onCheckedChange={(checked) => onSelectRecord(record.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{record.userName}</p>
                      <p className="text-xs text-muted-foreground">{record.userEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {record.userDepartment?.toUpperCase() || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {record.checkInTime ? (
                      <div className="flex items-center gap-2">
                        <TimeDisplay time={record.checkInTime} format12Hour={true} />
                        {record.isLate && (
                          <Badge variant="destructive" className="text-xs">
                            Late
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">Not checked in</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {record.checkOutTime ? (
                      <TimeDisplay time={record.checkOutTime} format12Hour={true} />
                    ) : (
                      <span className="text-gray-400">Not checked out</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getAttendanceTypeColor(record.attendanceType)}>
                      {record.attendanceType === 'field_work' ? 'Field Work' : 
                       record.attendanceType?.charAt(0).toUpperCase() + record.attendanceType?.slice(1) || 'Office'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(record.status)}>
                      {record.status?.charAt(0).toUpperCase() + record.status?.slice(1) || 'Present'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {record.workingHours ? (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{record.workingHours.toFixed(1)}h</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {record.overtimeHours && record.overtimeHours > 0 ? (
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {record.overtimeHours.toFixed(1)}h OT
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {record.isWithinOfficeRadius ? (
                        <Badge variant="default" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          Office
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          Remote
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(record.checkInImageUrl || record.checkOutImageUrl) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewImage({
                            url: record.checkInImageUrl || record.checkOutImageUrl,
                            employeeName: record.userName,
                            date: formatDate(new Date(record.date)),
                            time: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : 'N/A',
                            attendanceType: record.attendanceType,
                            customerName: record.customerName,
                            location: record.isWithinOfficeRadius ? 'Office' : 'Remote'
                          })}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditAttendance(record)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}