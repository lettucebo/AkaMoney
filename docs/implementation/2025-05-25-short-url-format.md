# Short URL Format Change Implementation Plan

## Objective

Change the short URL format from `aka.money/redirect/{code}` to directly using the root path `aka.money/{code}`, making the short URLs more concise and memorable.

## Background

Currently, short URLs use the `redirect` path prefix, making the URLs longer and less intuitive. Removing this prefix will make the short URLs more concise.

## Implementation Steps

1. Modify the route configuration in RedirectFunction.cs, changing `Route = "redirect/{code?}"` to `Route = "{code?}"`.
2. Ensure that the route change does not conflict with other existing API routes.
3. Update relevant documentation, including README.md.
4. Test if the new route works properly.

## Risks and Considerations

- Need to ensure the root path is not occupied by other features.
- Route changes may affect already published short URLs, need to consider backward compatibility.
- May need to set up URL rewriting rules to redirect the original `/redirect/{code}` path to `/{code}`.

## Impact Scope

- RedirectFunction.cs
- May need to update API call paths in frontend code
- Related documentation

## Testing Plan

1. Test if the new short URL format redirects properly
2. Test if the old `/redirect/{code}` path is still available (if backward compatibility is needed)

## Rollback Plan

If issues are found after implementation, changes can be rolled back by restoring the original route configuration.

## Completion Criteria

- Short URLs can be accessed using the `aka.money/{code}` format and correctly redirect
- All tests pass
- Related documentation has been updated
