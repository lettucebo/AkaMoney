# Merge AkaMoney.Redirect into AkaMoney.Functions

Date: 2025-05-25

## Overview

This implementation plan aims to merge the `AkaMoney.Redirect` project into the `AkaMoney.Functions` project to simplify the overall system architecture and reduce maintenance overhead.

## Background

Currently, our system has two separate Azure Functions projects:

1. `AkaMoney.Functions` - Contains APIs for creating and managing short URLs
2. `AkaMoney.Redirect` - Handles the redirection functionality of short URLs

These two projects are functionally related and share the same services, so merging them can simplify the deployment and management process.

## Implementation Steps

1. **Copy RedirectFunction**
   - Copy `RedirectFunction.cs` from the `AkaMoney.Redirect` project to the `Functions` folder in `AkaMoney.Functions`
   - Update the namespace from `AkaMoney.Redirect.Functions` to `AkaMoney.Functions.Functions`

2. **Resolve Dependencies**
   - Ensure that the `AkaMoney.Functions` project includes all dependencies used in the `AkaMoney.Redirect` project (already confirmed)

3. **Update Routes and Settings**
   - Ensure there are no routing conflicts with existing functions
   - Keep the same routing pattern to maintain the existing URL structure

4. **Testing**
   - Ensure the redirection functionality works properly after merging
   - Ensure existing short URL API functionality is not affected

5. **Remove Old Project**
   - Remove the `AkaMoney.Redirect` project from the solution after confirming the newly merged functionality works properly

## Expected Results

- A single `AkaMoney.Functions` project will handle both short URL creation and redirection functionality
- Simplified deployment process, only needing to deploy one Functions application
- Reduced maintenance overhead
