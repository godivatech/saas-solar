# Prakash Greens Energy Dashboard

## Overview
This enterprise-grade dashboard application for Prakash Greens Energy functions as a comprehensive business management system. It aims to optimize operations through attendance tracking, customer relationship management, product catalog management, quotation and invoice generation, payroll processing, and robust user management with role-based access control. The project's vision is to deliver a scalable and efficient business management solution tailored for the energy sector.

## User Preferences
Preferred communication style: Simple, everyday language.
Time format preference: 12-hour format (AM/PM) throughout the application.
Business logic preference: Google-level enterprise approach with department-based time management.
Overtime calculation: Simple rule - any work beyond department checkout time is considered overtime.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **UI Library**: Shadcn/ui components leveraging Radix UI primitives
- **Styling**: Tailwind CSS with a custom design system
- **State Management**: React Context for authentication, TanStack Query for server-side data
- **Routing**: Wouter for client-side navigation
- **Build Tool**: Vite for optimized development and production builds
- **UI/UX Decisions**: Emphasizes a clean, simple interface focused on essential data (photo, location, timing). Features enhanced, context-aware error messages and consistent 12-hour time formatting across the application.

### Backend
- **Runtime**: Node.js with Express.js
- **Authentication**: Firebase Auth with custom token verification
- **Database**: Firebase Firestore (NoSQL)
- **File Storage**: Cloudinary for attendance photos and documents
- **API Design**: RESTful with comprehensive error handling.

### Authentication & Authorization
- Implements a two-layer permission model based on department for feature access and designation for action permissions.
- **Role Hierarchy**: `master_admin` → `admin` → `employee`.
- Features granular access control with over 50 distinct permissions.

### Key Features & Technical Implementations
- **User Management**: Includes role-based access control with department and designation assignments.
- **Attendance Management**: Features enterprise-grade geolocation validation, photo verification, real-time location tracking (simplified), and automated late arrival/overtime calculations. Unified validation requires location access and a selfie for check-in/out. The system includes a Manual Overtime System with user-controlled sessions (Start/End OT buttons capturing selfies and GPS), a Smart Unified Checkout System for streamlined regular and overtime checkouts, robust OT Calculation & Payroll Integration, and a comprehensive Forgotten Checkout Management System with consolidated corrections and admin-only editing. All attendance components are fully mobile responsive.
- **Business Operations**: Encompasses CRM, a solar energy product catalog, quotation and invoice generation, and comprehensive payroll calculations.
- **Site Visit System**: Captures complete location data with Google Maps API reverse geocoding, displaying human-readable addresses. Features a scalable Visit History Timeline, a robust Follow-up Checkout System, and a comprehensive Photo Overlay System that automatically embeds timestamps and location info onto all captured photos for documentation. All site visit modals are fully mobile responsive.
- **Payroll System**: Supports dynamic earnings/deductions, EPF/ESI calculations, and various attendance statuses.
- **Enterprise Time Service**: Centralizes 12-hour format standardization, real-time overtime calculation based on schedules, and intelligent caching.
- **Code Optimization**: Utilizes code splitting and lazy loading for enhanced performance.

## External Dependencies
- **Firebase Services**: Firebase Auth (authentication), Firestore (database).
- **Cloudinary**: Image storage and optimization.
- **TanStack Query**: Server state management and caching.
- **Radix UI**: Accessible component primitives.
- **Google Maps API**: For reverse geocoding.