# Project Guidelines
## Documentation Requirements
- Update relevant documentation in /docs when modifying features
- Keep README.md in sync with new capabilities
- Maintain changelog entries in CHANGELOG.md
- Write implementation plan to .md files in /docs/implementation
  - Naming convention: <date>-<feature-name>.md

## Naming Conventions
- Code must include appropriate comments.
  - All classes and methods must have comments.
  - All variables and parameters must have comments.
  - Appropriately add comments throughout the entire code.
  - All comments must be written in English.

## Architecture Decision Records
Create ADRs in /docs/adr for:
- Major dependency changes
- Architectural pattern changes
- New integration patterns
- Database schema changes
    - Follow template in /docs/adr/template.md

## Code Style & Patterns
- Generate API clients using OpenAPI Generator
- Use TypeScript axios template
- Place generated code in /src/generated
- Prefer composition over inheritance
- Use repository pattern for data access
- Follow error handling pattern in /src/utils/errors.ts

## Testing Standards
- Unit tests required for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows

## General
- DO NOT BE LAZY. DO NOT OMIT CODE.
- Each step should be committed separately to preserve history.
- OS is Windows 11
- 分階段實作，先產生計畫，並在 Github 上面新增 issue 來追蹤進度，每完成一步驟就更新 issue 並加入 comment 補充說明
  - When creating issue, remember to add corresponding labels
  - note: remember always update the issue and add issue comment everytime

# MS SQL Guidelines

## 1. General Rules
- Table Naming
    - Always end with **plural** form
    - Entity Framework has a feature: to pluralize or singularize the generated names
      - Therefore, when tables use plural naming, objects will automatically use singular form, which is more straightforward
        - For example, table: Activities, object will automatically become: Activity
- Column Naming
	- Column names should use English naming, be **meaningful**, and use Pascal case (first letter of each word capitalized)
- Column Data Types
	- Use strong typing, for example: do not use varchar type to store numerical data

## 2. Related Standards
- Every table must have the following columns:
    - `All tables must have these columns, except for many-to-many relationship tables`
    - Example SQL as follows: 
    ``` sql
        CREATE TABLE [dbo].[MiniFlow](
            [Id] [uniqueidentifier] NOT NULL,
            [SeqNo] [int] IDENTITY(1,1) NOT NULL,
            [CreateTime] [datetimeoffset](7) NOT NULL,
            [ModifyTime] [datetimeoffset](7) NOT NULL,
            CONSTRAINT [PK_MiniFlow] PRIMARY KEY NONCLUSTERED
            (
                [Id] ASC
            )
        )
        GO
        CREATE CLUSTERED INDEX [IX_MiniFlow] ON [dbo].[MiniFlow]
        (
            [SeqNo] ASC
        )
        GO

        ALTER TABLE [dbo].[MiniFlow] ADD  CONSTRAINT [DF_MiniFlow_Id]  DEFAULT (newsequentialid()) FOR [Id]
        GO

        ALTER TABLE [dbo].[MiniFlow] ADD  CONSTRAINT [DF_MiniFlow_CreateTime]  DEFAULT (sysdatetimeoffset()) FOR [CreateTime]
        GO

        ALTER TABLE [dbo].[MiniFlow] ADD  CONSTRAINT [DF_MiniFlow_ModifyTime]  DEFAULT (sysdatetimeoffset()) FOR [ModifyTime]

        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Creation time' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'MiniFlow', @level2type=N'COLUMN',@level2name=N'CreateTime'
        GO
                                    
        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Modification time' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'MiniFlow', @level2type=N'COLUMN',@level2name=N'ModifyTime'
        GO  
    ```

- Primary Key
    - Always use the Id column, with data type uniqueidentifier and default value (newsequentialid())
      - [[SQL][Problem Solving]Performance abnormalities caused by using GUID field type and outdated statistics](https://dotblogs.com.tw/jamesfu/2016/01/18/guid_1)
      - [[SQL][Problem Solving]Further discussion on precautions for using GUID as primary key](https://dotblogs.com.tw/jamesfu/2016/01/20/guid_2#disqus_thread)

- Relationships
    - Tables that have relationships must establish foreign key constraints
    - Columns used as relationships (foreign keys) should all have Id as a suffix at the end of the column name to indicate that this column is a foreign key
    - Example: CreaterId (creator); relates to the Users table
    
- Boolean Data Type Columns
    - Begin with "Is" followed by the column name; use bit as data type, and must have a default value, cannot be Null
    <table>
        <tr>
            <th>Column Name</th>
            <th>Data Type</th>
            <th>Default Value</th>
            <th>Allow Null</th>
            <th>Description</th>
        </tr>
        <tr>
            <td>IsDelete</td>
            <td>bit</td>
            <td>(0)</td>
            <td>No</td>
            <td>Is deleted</td>
        </tr>
        <tr>
            <td>IsShow</td>
            <td>bit</td>
            <td>(1)</td>
            <td>No</td>
            <td>Is displayed</td>
        </tr>
    </table>

- Time Columns
    - Time column names should all have Time as a suffix for distinction
        - Time column data type must always use datetimeoffset(7)
        - Default value is sysdatetimeoffset()
    - If a column only stores dates, add Date as a suffix for distinction, and use Date data type
    <table>
        <tr>
            <th>Column Name</th>
            <th>Data Type</th>
            <th>Default Value</th>
            <th>Allow Null</th>
            <th>Description</th>
        </tr>
        <tr>
            <td>CreateTime</td>
            <td>datetimeoffset(7)</td>
            <td>(sysdatetimeoffset())</td>
            <td>No</td>
            <td>Creation time</td>
        </tr>
        <tr>
            <td>ModifyTime</td>
            <td>datetimeoffset(7)</td>
            <td>(sysdatetimeoffset())</td>
            <td>No</td>
            <td>Modification time</td>
        </tr>
        <tr>
            <td>BirthDate</td>
            <td>date</td>
            <td></td>
            <td>No</td>
            <td>Birthday</td>
        </tr>
    </table>

# Entity Framework Core Guidelines
## 1. General Rules
- Use the latest Package corresponding to the .NET SDK version
  - Example: .NET 8 uses EF Core 8.x.x
- Use Code First development approach
    - Use Fluent API for configuration
    - Do not place validation logic on the Model, but on the Service
- Use Migration for database migration
- Use Dependency Injection for dependency injection
- Use Repository Pattern for data access