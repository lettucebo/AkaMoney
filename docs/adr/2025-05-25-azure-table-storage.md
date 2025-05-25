# ADR-001: Using Azure Table Storage for Data Persistence

## Title
Using Azure Table Storage for Data Persistence

## Status
Accepted

## Context
The AkaMoney short URL service requires a data storage solution that is cost-effective, highly available, and scales well for our specific data access patterns. We need to store short URL records and click tracking information. Our primary requirements include:

1. Low latency for single-key lookups (mapping short URLs to destination URLs)
2. Support for high write throughput (for click tracking)
3. Cost-effectiveness for a solution that may scale significantly
4. Minimal management overhead
5. Built-in redundancy and high availability

## Decision
We will use Azure Table Storage as our primary data store for the AkaMoney short URL service.

## Consequences

### Positive
- Low cost - Azure Table Storage is one of the most cost-effective storage options in Azure
- Highly available by default with geo-redundancy options
- Automatic scaling with no capacity planning needed
- Serverless pricing model matches well with our Azure Function consumption plan
- Millisecond access times for the primary lookup use case (short URL to destination URL)
- Simple integration with Azure Functions

### Negative
- Limited query capabilities compared to a relational database
- No support for complex joins or secondary indexes
- No referential integrity or constraints
- No transactions across partition keys
- Limited data types

## Alternatives Considered

### Azure SQL Database
- Pros: Full relational model, rich query capabilities, ACID transactions
- Cons: Higher cost, especially at scale; requires more management; fixed capacity that needs to be provisioned in advance

### Azure Cosmos DB
- Pros: Global distribution, multi-model support, more powerful query capabilities
- Cons: Significantly higher cost for our use case; more complex to manage; feature-rich when we only need simple operations

## References
- [Azure Table Storage Documentation](https://docs.microsoft.com/en-us/azure/storage/tables/table-storage-overview)
- [Azure Storage Pricing](https://azure.microsoft.com/en-us/pricing/details/storage/)
- [Performance and scalability checklist for Table storage](https://docs.microsoft.com/en-us/azure/storage/tables/storage-table-performance-checklist)
