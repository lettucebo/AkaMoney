# MS SQL 準則

## 1. 通用規範
- 資料表命名
    - 一律以**複數**結尾
    - Entity Framework有一功能為：將產生的名稱複數化或單數化
      - 因此當資料表使用複數命名時，物件便會自動使用單數，較簡單明瞭
        - 如，資料表：Activities、物件便會自動變為：Activity
- 欄位命名
	- 欄位名稱使用英文命名，應具有**意義**，並使用Pascal命名法（單字首字大寫）
- 欄位資料型態
	- 使用強型別，舉例：勿使用varchar類型儲存數字等資料

## 2. 相關規範
- 每個資料表都要有以下欄位：
    - `不論多細小的資料表都一定要有，除了多對多關聯資料表以外`
    - 如下範例 SQL: 
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

        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'建立時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'MiniFlow', @level2type=N'COLUMN',@level2name=N'CreateTime'
        GO
                                    
        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'修改時間' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'MiniFlow', @level2type=N'COLUMN',@level2name=N'ModifyTime'
        GO  
    ```

- 主鍵
    - 一律使用 Id 欄位，資料型態為 uniqueidentifier 且預設值為 (newsequentialid())
      - [[SQL][問題處理]使用 GUID 欄位型態與統計資料過舊造成的效能異常案例處理](https://dotblogs.com.tw/jamesfu/2016/01/18/guid_1)
      - [[SQL][問題處理]再論 GUID 當成主鍵需要注意事項](https://dotblogs.com.tw/jamesfu/2016/01/20/guid_2#disqus_thread)

- 關聯
    - 資料表之間有關係的一定要拉關聯
    - 作為關聯的欄位（外來鍵），均於欄位名稱最後面加上 Id 作為結尾，代表此欄位為外來鍵
    - 如：CreaterId（建立者）；關連至 Users 資料表
    
- Boolean 值資料類型欄位
    - 以 Is 開頭，並於後面接上欄位名稱；使用 bit 做為資料型態，並一定要有預設值，不可為 Null
    <table>
    <tr>
        <th>欄位名稱</th>
        <th>資料型態</th>
        <th>預設值</th>
        <th>是否允許 Null</th>
        <th>描述</th>
    </tr>
    <tr>
        <td>IsDelete</td>
        <td>bit</td>
        <td>(0)</td>
        <td>否</td>
        <td>是否刪除</td>
    </tr>
    <tr>
        <td>IsShow</td>
        <td>bit</td>
        <td>(1)</td>
        <td>否</td>
        <td>是否顯示</td>
    </tr>
</table>

- 時間欄位
    - 時間欄位名稱均於名字後面加上Time做為區別
        - 時間欄位資料型態一律使用 datetimeoffset(7)
        - 預設值為 sysdatetimeoffset()
    - 若欄位只單純儲存日期則於名字後面加上Date 做為區別，並使用 Date 資料型態
    <table>
    <tr>
        <th>欄位名稱</th>
        <th>資料型態</th>
        <th>預設值</th>
        <th>是否允許 Null</th>
        <th>描述</th>
    </tr>
    <tr>
        <td>CreatTime</td>
        <td>datetimeoffset(7)</td>
        <td>(sysdatetimeoffset())</td>
        <td>否</td>
        <td>建立時間</td>
    </tr>
    <tr>
        <td>ModifyTime</td>
        <td>datetimeoffset(7)</td>
        <td>(sysdatetimeoffset())</td>
        <td>否</td>
        <td>修改時間</td>
    </tr>
    <tr>
        <td>BirthDate</td>
        <td>date</td>
        <td></td>
        <td>否</td>
        <td>生日</td>
    </tr>
</table>