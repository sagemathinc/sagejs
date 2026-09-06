"""Search-output and descriptor-safety fixture for both execution profiles."""

_property_reads = []


def DocumentationStandaloneProbe():
    """Standalone-search-café marker."""
    pass


class DocumentationSearchParent:
    def inherited(self):
        """Inherited-search-café marker."""
        pass


class DocumentationSearchChild(DocumentationSearchParent):
    def own(self):
        """Own-search-café marker."""
        pass

    @property
    def explosive(self):
        _property_reads.append("getter")
        raise AssertionError("documentation search invoked a property getter")


search_doc("natural logarithm")
search_doc("standalone search cafe")
search_doc("inherited search cafe")
search_doc("own search cafe")
search_doc("DocumentationSearchChild.inherited")
search_doc("DocumentationSearchChild.own")
assert _property_reads == []
print("documentation-search-profile-ok")
